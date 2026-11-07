import { describe, expect, it } from 'vitest';
import { sharedSetup, token } from './shared-support';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import {
  contentKey,
  stateKey,
} from '../../src/application/storage/checkpoints';
import { applyLibraryCommand } from '../../src/domain/library';
import { digest } from '../../src/domain/storage/json';
import { unpackJson } from '../../src/domain/storage/archive';
import { mutex } from './storage-support';

async function interrupted() {
  const context = await sharedSetup();
  const before = await context.storage.requireActiveData();
  const input = {
    id: token(1),
    expectedHead: before.head,
    command: {
      kind: 'list.create' as const,
      name: 'Synthetic interrupted input',
      lines: ['https://example.test/exact?x=%2526', ''],
    },
  };
  const data = applyLibraryCommand(before.data, input.command, input.id);
  context.port.failKey = contentKey('list', await digest(data.lists[0]!));
  await expect(context.storage.mutate(input)).rejects.toThrow(
    'STORAGE_WRITE_FAILED',
  );
  context.port.failKey = null;
  const restarted = new StorageCoordinator(context.port, mutex());
  const pending = (await restarted.pendingMutations())[0]!;
  expect(pending.input).toBeNull();
  return { ...context, storage: restarted, before, input, pending };
}
describe('verified interrupted-save quarantine', () => {
  it('unblocks new editing and imports after a restart while preserving the partial records and exact archived source', async () => {
    const c = await interrupted();
    const raw = structuredClone(c.port.local);
    const archive = await c.storage.exportArchive({});
    const portable = await unpackJson(archive);
    expect(portable).toBeTruthy();
    await c.storage.quarantineMutation(
      {},
      archive,
      c.pending.stateDigest,
      c.before.head,
    );
    expect(await c.storage.pendingMutations()).toEqual([]);
    expect(await c.storage.requireActiveData()).toEqual(c.before);
    for (let i = 2; i <= 8; i++)
      await c.storage.mutate({
        id: token(i),
        expectedHead: (await c.storage.requireActiveData()).head,
        command: { kind: 'settings.update', patch: { nightMode: i % 2 === 0 } },
      });
    expect(c.port.local[stateKey(c.pending.stateDigest)]).toEqual(
      raw[stateKey(c.pending.stateDigest)],
    );
    await expect(c.storage.mutate(c.input)).rejects.toThrow(
      'OPERATION_QUARANTINED',
    );
    const fresh = new StorageCoordinator(c.port, mutex());
    expect(await fresh.pendingMutations()).toEqual([]);
    expect((await fresh.requireActiveData()).data.lists).toEqual([]);
  });
  it('refuses stale, damaged or incomplete backups and refuses quarantining the active save', async () => {
    const c = await interrupted();
    const archive = await c.storage.exportArchive({});
    await expect(
      c.storage.quarantineMutation(
        {},
        { ...archive, digest: token(900) },
        c.pending.stateDigest,
        c.before.head,
      ),
    ).rejects.toThrow('RECOVERY_ARCHIVE_INVALID');
    await expect(
      c.storage.quarantineMutation(
        {},
        archive,
        c.before.head.stateDigest,
        c.before.head,
      ),
    ).rejects.toThrow('PENDING_CHANGE_NOT_FOUND');
    c.port.local['synthetic-new-source'] = 'keep';
    await expect(
      c.storage.quarantineMutation(
        {},
        archive,
        c.pending.stateDigest,
        c.before.head,
      ),
    ).rejects.toThrow('ARCHIVE_SOURCES_CHANGED');
    expect(await c.storage.pendingMutations()).toHaveLength(1);
  });
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'keeps all interrupted records if quarantine acknowledgement fails: %s',
    async (failure) => {
      const c = await interrupted();
      const raw = structuredClone(c.port.local);
      const archive = await c.storage.exportArchive({});
      c.port.failAt = c.port.writes.length + 1;
      c.port.failure = failure;
      await expect(
        c.storage.quarantineMutation(
          {},
          archive,
          c.pending.stateDigest,
          c.before.head,
        ),
      ).rejects.toThrow(/STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/);
      for (const [key, value] of Object.entries(raw))
        expect(c.port.local[key]).toEqual(value);
      c.port.failAt = 0;
      if (failure === 'after')
        expect(await c.storage.pendingMutations()).toEqual([]);
      else if (failure === 'corrupt')
        await expect(c.storage.pendingMutations()).rejects.toThrow(
          'QUARANTINE_INTEGRITY_FAILED',
        );
      else expect(await c.storage.pendingMutations()).toHaveLength(1);
    },
  );
  it('also offers damaged inactive headers for quarantine without deleting any surviving content', async () => {
    const c = await sharedSetup();
    const before = await c.storage.requireActiveData();
    const key = stateKey(token(99));
    c.port.local[key] = null;
    expect((await c.storage.pendingMutations())[0]?.input).toBeNull();
    const archive = await c.storage.exportArchive({});
    await c.storage.quarantineMutation({}, archive, token(99), before.head);
    await c.storage.mutate({
      id: token(2),
      expectedHead: before.head,
      command: { kind: 'settings.update', patch: { nightMode: true } },
    });
    expect(c.port.local[key]).toBeNull();
  });
});

it('acknowledges an already quarantined change after another editor has saved', async () => {
  const c = await interrupted();
  const archive = await c.storage.exportArchive({});
  await c.storage.quarantineMutation(
    {},
    archive,
    c.pending.stateDigest,
    c.before.head,
  );
  await c.storage.mutate({
    id: token(2),
    expectedHead: c.before.head,
    command: { kind: 'settings.update', patch: { nightMode: true } },
  });
  const current = await c.storage.requireActiveData();
  expect(
    (
      await c.storage.quarantineMutation(
        {},
        archive,
        c.pending.stateDigest,
        c.before.head,
      )
    ).head,
  ).toEqual(current.head);
});

it('can set aside a damaged inactive header with an orphaned expected revision', async () => {
  const c = await interrupted();
  const raw = c.port.local[stateKey(c.pending.stateDigest)] as {
    operation: { expectedHead: { stateDigest: string } };
  };
  raw.operation.expectedHead.stateDigest = token(999);
  expect((await c.storage.pendingMutations())[0]?.input).toBeNull();
  const archive = await c.storage.exportArchive({});
  await c.storage.quarantineMutation(
    {},
    archive,
    c.pending.stateDigest,
    c.before.head,
  );
  await c.storage.mutate({
    id: token(2),
    expectedHead: c.before.head,
    command: { kind: 'settings.update', patch: { nightMode: true } },
  });
  expect(c.port.local[stateKey(c.pending.stateDigest)]).toEqual(raw);
});
