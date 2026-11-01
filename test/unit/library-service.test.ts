import { describe, expect, it } from 'vitest';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { headKey, type LibraryCommand } from '../../src/domain/storage/schema';
import { sharedSetup, token } from './shared-support';

describe('serialized library mutations', () => {
  async function command(
    storage: StorageCoordinator,
    id: number,
    command: LibraryCommand,
  ) {
    return storage.mutate({
      id: token(id),
      expectedHead: (await storage.requireActiveData()).head,
      command,
    });
  }
  it('creates unique IDs, preserves exact lines and updates one-line lists without changing identities', async () => {
    const { storage } = await sharedSetup();
    const one = await command(storage, 1, {
      kind: 'list.create',
      name: 'Example',
      lines: ['  first query  ', 'https://example.test/?x=%2526', ''],
    });
    const id = one.data!.lists[0]!.id;
    expect(id).toBe('list-' + token(1));
    expect(one.data!.lists[0]!.legacyId).toBeNull();
    const updated = await command(storage, 2, {
      kind: 'list.update',
      id,
      name: 'Changed',
      lines: ['https://single.example.test/'],
    });
    expect(updated.data!.lists[0]).toMatchObject({
      id,
      name: 'Changed',
      lines: ['https://single.example.test/'],
    });
    await command(storage, 3, {
      kind: 'list.create',
      name: 'Changed',
      lines: [],
    });
    expect((await storage.requireActiveData()).data.lists).toHaveLength(2);
    expect(updated.canRollback).toBe(false);
  });
  it('refuses empty names while preserving the original and allows a deliberately empty URL array', async () => {
    const { storage } = await sharedSetup();
    const original = await command(storage, 1, {
      kind: 'list.create',
      name: 'Keep',
      lines: ['https://keep.example.test/'],
    });
    await expect(
      command(storage, 2, {
        kind: 'list.update',
        id: original.data!.lists[0]!.id,
        name: '',
        lines: [],
      }),
    ).rejects.toThrow('LIST_NAME_REQUIRED');
    expect(await storage.requireActiveData()).toEqual({
      head: original.head,
      data: original.data,
    });
  });
  it('clears both references when deleting a list and retains unrelated preferences, drafts and raw sources', async () => {
    const { storage, review } = await sharedSetup();
    const created = await command(storage, 1, {
      kind: 'list.create',
      name: 'Target',
      lines: [],
    });
    const id = created.data!.lists[0]!.id;
    await command(storage, 2, {
      kind: 'settings.update',
      patch: {
        defaultListOpen: id,
        openOnLaunch: id,
        tabCreationDelay: 0.125,
        nightMode: true,
      },
    });
    await command(storage, 3, {
      kind: 'draft.update',
      lines: ['café & value=%25', ''],
    });
    const deleted = await command(storage, 4, { kind: 'list.delete', id });
    expect(deleted.data).toMatchObject({
      lists: [],
      draftLines: ['café & value=%25', ''],
      settings: {
        defaultListOpen: 'current-tabs',
        openOnLaunch: null,
        tabCreationDelay: 0.125,
        nightMode: true,
      },
    });
    expect(
      (await storage.backup(review.backupDigest)).sources.localStorage,
    ).toEqual({});
    await expect(storage.rollback(deleted.head!)).rejects.toThrow(
      'ROLLBACK_UNAVAILABLE',
    );
  });
  it('rejects invalid references and stale concurrent edits without overwriting the winner', async () => {
    const { storage } = await sharedSetup();
    const before = await storage.requireActiveData();
    await expect(
      command(storage, 1, {
        kind: 'settings.update',
        patch: { openOnLaunch: 'list-' + token(900) },
      }),
    ).rejects.toThrow('INVALID_DATA_REFERENCE');
    await storage.mutate({
      id: token(2),
      expectedHead: before.head,
      command: { kind: 'settings.update', patch: { nightMode: true } },
    });
    await expect(
      storage.mutate({
        id: token(3),
        expectedHead: before.head,
        command: { kind: 'settings.update', patch: { nightMode: false } },
      }),
    ).rejects.toThrow('REVISION_CONFLICT');
    expect((await storage.requireActiveData()).data.settings.nightMode).toBe(
      true,
    );
  });
  it('deduplicates a retried operation even after later edits, and rejects reused IDs with different payloads', async () => {
    const { storage } = await sharedSetup();
    const before = await storage.requireActiveData();
    const input = {
      id: token(1),
      expectedHead: before.head,
      command: { kind: 'list.create' as const, name: 'Example', lines: [] },
    };
    await storage.mutate(input);
    const later = await command(storage, 2, {
      kind: 'settings.update',
      patch: { nightMode: true },
    });
    expect(await storage.mutate(input)).toEqual(later);
    await expect(
      storage.mutate({
        ...input,
        command: { ...input.command, name: 'Different' },
      }),
    ).rejects.toThrow('OPERATION_ID_REUSED');
    expect((await storage.requireActiveData()).data.lists).toHaveLength(1);
  });
  it.each(['before', 'after', 'drop'] as const)(
    'retains pending changes and safely retries a mutation head failure: %s',
    async (failure) => {
      const { storage, port, lock } = await sharedSetup();
      const before = await storage.requireActiveData();
      const input = {
        id: token(1),
        expectedHead: before.head,
        command: {
          kind: 'list.create' as const,
          name: 'Pending',
          lines: ['https://pending.example.test/'],
        },
      };
      port.failAt = port.writes.length + 2;
      port.failure = failure;
      await expect(storage.mutate(input)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      port.failAt = 0;
      const restarted = new StorageCoordinator(port, lock);
      if (failure !== 'after') {
        expect((await restarted.pendingMutations())[0]?.input).toEqual(input);
        await expect(restarted.rollback(before.head)).rejects.toThrow(
          'PENDING_MUTATION',
        );
        expect(port.local[headKey]).toEqual(before.head);
      }
      expect((await restarted.mutate(input)).data!.lists).toHaveLength(1);
      expect(await restarted.pendingMutations()).toEqual([]);
    },
  );
});
