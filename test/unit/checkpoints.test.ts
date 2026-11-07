import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  StorageCoordinator,
  readRecoveryStore,
} from '../../src/application/storage/coordinator';
import {
  CheckpointReader,
  contentKey,
  recordBytes,
  stateKey,
} from '../../src/application/storage/checkpoints';
import { WorkspaceService } from '../../src/application/workspace';
import { applyLibraryCommand } from '../../src/domain/library';
import {
  checkpointSchema,
  checkpointHistoryLimit,
} from '../../src/domain/storage/checkpoints';
import { digest } from '../../src/domain/storage/json';
import { toPortable } from '../../src/domain/portable';
import {
  headKey,
  stateSchema,
  type LibraryCommand,
  type MutationInput,
} from '../../src/domain/storage/schema';
import { sharedSetup, token } from './shared-support';
import { mutex } from './storage-support';

type Context = Awaited<ReturnType<typeof sharedSetup>>;
const bytes = (store: Record<string, unknown>) =>
  Object.entries(store).reduce(
    (size, [key, raw]) => size + recordBytes(key, raw),
    0,
  );
async function mutate(context: Context, id: number, command: LibraryCommand) {
  return context.storage.mutate({
    id: token(id),
    expectedHead: (await context.storage.requireActiveData()).head,
    command,
  });
}
function roots(context: Context) {
  return Object.entries(context.port.local).filter(
    ([key, raw]) =>
      key.startsWith('buo:v2:state:') && v.is(checkpointSchema, raw),
  );
}
async function oldMutation(
  context: Context,
  id: number,
  command: LibraryCommand,
) {
  const { head, data } = await context.storage.requireActiveData();
  const previous = v.parse(
    stateSchema,
    context.port.local[stateKey(head.stateDigest)],
  );
  const state = {
    schemaVersion: 2 as const,
    kind: 'mutation' as const,
    revision: head.revision + 1,
    previous: head,
    backupDigest: previous.backupDigest,
    stageDigest: previous.stageDigest,
    restoreTarget: null,
    data: applyLibraryCommand(data, command, token(id)),
    operation: {
      id: token(id),
      command,
      requestDigest: await digest({ expectedHead: head, command }),
    },
  };
  const hash = await digest(state);
  context.port.local[stateKey(hash)] = state;
  context.port.local[headKey] = {
    schemaVersion: 1,
    revision: state.revision,
    stateDigest: hash,
  };
}

// This fixture intentionally writes the previous preview's schema, independently
// of the current writer, to exercise adoption of real old record shapes.
async function previewHistory(count = 12) {
  const context = await sharedSetup();
  await oldMutation(context, 1, {
    kind: 'list.create',
    name: 'Synthetic history',
    lines: Array.from(
      { length: 5000 },
      (_, index) =>
        'https://volume.example.test/' + index + '?exact=%2526&unicode=café',
    ),
  });
  for (let i = 2; i <= count; i++)
    await oldMutation(context, i, {
      kind: 'settings.update',
      patch: { nightMode: i % 2 === 0 },
    });
  return context;
}

describe('independent, bounded save checkpoints', () => {
  it('reuses unchanged lists across 1000 settings saves and bounds roots, receipts and bytes', async () => {
    const context = await sharedSetup();
    const lines = Array.from(
      { length: 5000 },
      (_, index) =>
        'https://volume.example.test/' + index + '?a=%2526&unicode=café',
    );
    await mutate(context, 1, { kind: 'list.create', name: 'Volume', lines });
    const listKeys = Object.keys(context.port.local).filter((key) =>
      key.startsWith('buo:v2:content:list:'),
    );
    let warmBytes = 0;
    for (let i = 2; i <= 1001; i++) {
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
      if (i === 80) warmBytes = bytes(context.port.local);
    }
    const active = await context.storage.requireActiveData();
    const root = v.parse(
      checkpointSchema,
      context.port.local[stateKey(active.head.stateDigest)],
    );
    expect(active.data.lists[0]!.lines).toEqual(lines);
    expect(root.retained).toHaveLength(checkpointHistoryLimit);
    expect(root.receipts).toHaveLength(64);
    expect(roots(context)).toHaveLength(1 + checkpointHistoryLimit);
    expect(
      Object.keys(context.port.local).filter((key) =>
        key.startsWith('buo:v2:content:list:'),
      ),
    ).toEqual(listKeys);
    expect(bytes(context.port.local)).toBeLessThan(warmBytes + 2048);
    expect(
      Object.keys(context.port.local).filter((key) =>
        key.startsWith('buo:v2:snapshot:'),
      ),
    ).toEqual([]);
  }, 120_000);
  it('keeps exactly one preceding independent save across large list edits', async () => {
    const context = await sharedSetup();
    for (let i = 1; i <= 8; i++)
      await mutate(
        context,
        i,
        i === 1
          ? {
              kind: 'list.create',
              name: 'Large versions',
              lines: ['x'.repeat(1500 * 1024) + String(i)],
            }
          : {
              kind: 'list.update',
              id: 'list-' + token(1),
              name: 'Large versions',
              lines: ['x'.repeat(1500 * 1024) + String(i)],
            },
      );
    const active = await context.storage.requireActiveData();
    const root = v.parse(
      checkpointSchema,
      context.port.local[stateKey(active.head.stateDigest)],
    );
    expect(root.retained).toHaveLength(1);
    const reader = new CheckpointReader(context.port.local);
    expect(
      (await reader.read(root.retained[0]!)).data.lists[0]!.lines[0],
    ).toMatch(/7$/);
    expect(roots(context)).toHaveLength(2);
    expect(
      Object.keys(context.port.local).filter((key) =>
        key.startsWith('buo:v2:content:list:'),
      ),
    ).toHaveLength(2);
  }, 30_000);
  it('reads the first schema-4 preview with five references and reduces retention on the next save', async () => {
    const context = await sharedSetup();
    context.port.removeFailure = true;
    for (let i = 1; i <= 7; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    const current = await context.storage.requireActiveData();
    const state = v.parse(
      checkpointSchema,
      context.port.local[stateKey(current.head.stateDigest)],
    );
    const previous = roots(context)
      .map(([key, raw]) => ({ key, state: v.parse(checkpointSchema, raw) }))
      .filter((item) => item.state.revision < current.head.revision)
      .sort((a, b) => b.state.revision - a.state.revision)
      .slice(0, 5);
    const legacyRoot = {
      ...state,
      retained: previous.map((item) => ({
        schemaVersion: 1 as const,
        revision: item.state.revision,
        stateDigest: item.key.slice('buo:v2:state:'.length),
      })),
    };
    const legacyDigest = await digest(legacyRoot);
    context.port.local[stateKey(legacyDigest)] = legacyRoot;
    context.port.local[headKey] = {
      ...current.head,
      stateDigest: legacyDigest,
    };
    expect((await context.storage.requireActiveData()).data).toEqual(
      current.data,
    );
    context.port.removeFailure = false;
    await mutate(context, 8, {
      kind: 'settings.update',
      patch: { nightMode: current.data.settings.nightMode },
    });
    expect(roots(context)).toHaveLength(2);
    const active = await context.storage.requireActiveData();
    expect(
      v.parse(
        checkpointSchema,
        context.port.local[stateKey(active.head.stateDigest)],
      ).retained,
    ).toHaveLength(1);
    expect(
      (
        await new CheckpointReader(context.port.local).read({
          ...current.head,
          stateDigest: legacyDigest,
        })
      ).data,
    ).toEqual(current.data);
  });
  it('deduplicates recent requests after their original root is collected and safely rejects older stale requests', async () => {
    const context = await sharedSetup();
    const first: MutationInput = {
      id: token(1),
      expectedHead: (await context.storage.requireActiveData()).head,
      command: { kind: 'list.create', name: 'Once', lines: ['keep exact'] },
    };
    await context.storage.mutate(first);
    for (let i = 2; i <= 12; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    const head = (await context.storage.requireActiveData()).head;
    expect((await context.storage.mutate(first)).head).toEqual(head);
    await expect(
      context.storage.mutate({
        ...first,
        command: {
          ...first.command,
          kind: 'list.create',
          name: 'Different',
          lines: [],
        },
      }),
    ).rejects.toThrow('OPERATION_ID_REUSED');
    for (let i = 13; i <= 70; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    await expect(context.storage.mutate(first)).rejects.toThrow(
      'REVISION_CONFLICT',
    );
    expect((await context.storage.requireActiveData()).data.lists).toHaveLength(
      1,
    );
  });
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'keeps the acknowledged library when a new list blob fails: %s',
    async (failure) => {
      const context = await sharedSetup();
      const before = await context.storage.requireActiveData();
      const input: MutationInput = {
        id: token(1),
        expectedHead: before.head,
        command: {
          kind: 'list.create',
          name: 'Unsaved input',
          lines: [' keep & café ', ''],
        },
      };
      const next = applyLibraryCommand(before.data, input.command, input.id);
      const key = contentKey('list', await digest(next.lists[0]!));
      context.port.failKey = key;
      context.port.failure = failure;
      await expect(context.storage.mutate(input)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      expect(await context.storage.requireActiveData()).toEqual(before);
      const pending = await context.storage.pendingMutations();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.input).toEqual(failure === 'after' ? input : null);
      context.port.failKey = null;
      if (failure === 'corrupt') {
        await expect(context.storage.mutate(input)).rejects.toThrow(
          /IMMUTABLE_RECORD_CONFLICT|INTEGRITY_CHECK_FAILED/,
        );
        expect(context.port.local[key]).toBeNull();
      } else {
        await context.storage.mutate(input);
        expect((await context.storage.requireActiveData()).data).toEqual(next);
      }
    },
  );
  it('keeps a damaged older copy and its surviving content after it leaves ordinary retention', async () => {
    const context = await sharedSetup();
    const first = await mutate(context, 1, {
      kind: 'list.create',
      name: 'Earlier',
      lines: ['original damaged-copy input'],
    });
    const root = v.parse(
      checkpointSchema,
      context.port.local[stateKey(first.head!.stateDigest)],
    );
    const keys = (
      await new CheckpointReader(context.port.local).read(first.head!)
    ).keys;
    await mutate(context, 2, {
      kind: 'list.update',
      id: 'list-' + token(1),
      name: 'Current',
      lines: ['current verified input'],
    });
    const damagedKey = contentKey('list', root.lists[0]!.digest);
    context.port.local[damagedKey] = { damaged: 'keep exact' };
    const protectedRecords = Object.fromEntries(
      [...keys].map((key) => [key, structuredClone(context.port.local[key])]),
    );
    for (let i = 3; i <= 12; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    for (const [key, value] of Object.entries(protectedRecords))
      expect(context.port.local[key]).toEqual(value);
    expect(
      (await context.storage.requireActiveData()).data.lists[0]!.lines,
    ).toEqual(['current verified input']);
  });
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'preserves the active library if writing the checkpoint intent fails: %s',
    async (failure) => {
      const context = await sharedSetup();
      const before = await context.storage.requireActiveData();
      context.port.failAt = context.port.writes.length + 1;
      context.port.failure = failure;
      const input: MutationInput = {
        id: token(1),
        expectedHead: before.head,
        command: {
          kind: 'list.create',
          name: 'Keep in editor',
          lines: ['exact unsaved input'],
        },
      };
      await expect(context.storage.mutate(input)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      expect(await context.storage.requireActiveData()).toEqual(before);
      context.port.failAt = 0;
      if (failure === 'corrupt') {
        const raw = await context.storage.exportRecovery({});
        expect(Object.values(raw.sources.storageLocal)).toContain(null);
      } else {
        await context.storage.mutate(input);
        expect(
          (await context.storage.requireActiveData()).data.lists[0]!.lines,
        ).toEqual(['exact unsaved input']);
      }
    },
  );
  it('keeps saved data and a durable cleanup plan after a partially completed removal', async () => {
    const context = await sharedSetup();
    for (let i = 1; i <= 6; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    const originalRemove = context.port.removeLocal.bind(context.port);
    context.port.removeLocal = async (keys) => {
      await originalRemove(keys.slice(0, 1));
      throw new Error('interrupted deletion');
    };
    await mutate(context, 7, {
      kind: 'settings.update',
      patch: { nightMode: true },
    });
    expect(
      (await context.storage.requireActiveData()).data.settings.nightMode,
    ).toBe(true);
    expect((await context.storage.storageInfo()).cleanupPending).toBe(true);
    context.port.removeLocal = originalRemove;
    await mutate(context, 8, {
      kind: 'settings.update',
      patch: { nightMode: false },
    });
    expect((await context.storage.storageInfo()).cleanupPending).toBe(false);
    expect(roots(context)).toHaveLength(2);
    expect(await readRecoveryStore(context.port.local)).toEqual(
      (await context.storage.requireActiveData()).data,
    );
  });
  it('protects unresolved transfers, conflict drafts, pending jobs, raw sources and damaged records during ordinary cleanup', async () => {
    const context = await sharedSetup();
    const workspace = new WorkspaceService(context.storage);
    await workspace.preview(
      JSON.stringify(
        toPortable((await context.storage.requireActiveData()).data),
      ),
      'file',
    );
    await workspace.saveDraft({
      client: token(50),
      sequence: 1,
      base: null,
      lines: ['current input'],
    });
    await workspace.saveDraft({
      client: token(51),
      sequence: 1,
      base: null,
      lines: ['unresolved conflict'],
    });
    await context.opening.enqueue({
      kind: 'lines',
      id: token(80),
      lines: ['https://job.example.test/'],
      windowId: 1,
    });
    context.port.local['buo:v2:snapshot:' + token(900)] = { damaged: true };
    context.port.local['original-unknown'] = { raw: 'keep' };
    const protectedRecords = structuredClone(context.port.local);
    for (let i = 1; i <= 10; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    for (const [key, value] of Object.entries(protectedRecords))
      if (key !== headKey) expect(context.port.local[key]).toEqual(value);
  });
});

it('keeps the ownership context when a planned cleanup record changes before deletion', async () => {
  const c = await sharedSetup();
  const first = await mutate(c, 1, {
    kind: 'list.create',
    name: 'Before',
    lines: ['original protected text'],
  });
  const keys = (await new CheckpointReader(c.port.local).read(first.head!))
    .keys;
  const oldRoot = v.parse(
    checkpointSchema,
    c.port.local[stateKey(first.head!.stateDigest)],
  );
  await mutate(c, 2, {
    kind: 'list.update',
    id: 'list-' + token(1),
    name: 'After',
    lines: ['new text'],
  });
  c.port.removeFailure = true;
  await mutate(c, 3, { kind: 'settings.update', patch: { nightMode: true } });
  const damaged = contentKey('list', oldRoot.lists[0]!.digest);
  c.port.local[damaged] = { damaged: 'keep' };
  const raw = Object.fromEntries(
    [...keys].map((key) => [key, structuredClone(c.port.local[key])]),
  );
  c.port.removeFailure = false;
  await mutate(c, 4, { kind: 'settings.update', patch: { nightMode: false } });
  for (const [key, value] of Object.entries(raw))
    expect(c.port.local[key]).toEqual(value);
});

it('preserves a damaged fallback base without acknowledging unrelated staged changes', async () => {
  const c = await previewHistory(3);
  await mutate(c, 10, { kind: 'settings.update', patch: { nightMode: true } });
  const adopted = await c.storage.requireActiveData();
  const base = v.parse(
    checkpointSchema,
    c.port.local[stateKey(adopted.head.stateDigest)],
  ).base!;
  const archive = await c.storage.exportArchive({});
  await c.storage.compactArchive({}, archive);
  const current = await c.storage.requireActiveData();
  const materialized = v.parse(
    checkpointSchema,
    c.port.local[stateKey(current.head.stateDigest)],
  );
  c.port.local[stateKey(adopted.head.stateDigest)] = null;
  const pendingInput = {
    id: token(20),
    expectedHead: current.head,
    command: {
      kind: 'list.create' as const,
      name: 'Unfinished',
      lines: ['missing blob'],
    },
  };
  const data = applyLibraryCommand(
    current.data,
    pendingInput.command,
    pendingInput.id,
  );
  c.port.failKey = contentKey('list', await digest(data.lists.at(-1)!));
  await expect(c.storage.mutate(pendingInput)).rejects.toThrow(
    'STORAGE_WRITE_FAILED',
  );
  c.port.failKey = null;
  await c.storage.mutate({
    id: materialized.operation.id,
    expectedHead: materialized.operation.expectedHead,
    command: { kind: 'settings.update', patch: {} },
  });
  expect(c.port.local[stateKey(base.stateDigest)]).toBeDefined();
  expect(await c.storage.pendingMutations()).toHaveLength(1);
});

describe('verified archival of earlier preview history', () => {
  it('adopts a nearly full legacy preview store and frees only externally verified history', async () => {
    const context = await previewHistory(28);
    const quota = 10 * 1024 * 1024;
    const fillerKey = 'synthetic-original-near-quota';
    const filler = Math.max(
      0,
      quota - bytes(context.port.local) - fillerKey.length - 2 - 64 * 1024,
    );
    context.port.local[fillerKey] = 'q'.repeat(filler);
    const originalWrite = context.port.writeLocal.bind(context.port);
    context.port.writeLocal = (values) =>
      bytes({ ...context.port.local, ...values }) > quota
        ? Promise.reject(new Error('QUOTA_BYTES'))
        : originalWrite(values);
    expect(bytes(context.port.local)).toBeGreaterThan(quota - 128 * 1024);
    const before = await context.storage.requireActiveData();
    await mutate(context, 100, {
      kind: 'settings.update',
      patch: { nightMode: before.data.settings.nightMode },
    });
    const archive = await context.storage.exportArchive({});
    await context.storage.compactArchive({}, archive);
    for (let i = 101; i <= 108; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: before.data.settings.nightMode },
      });
    expect((await context.storage.requireActiveData()).data).toEqual(
      before.data,
    );
    expect(context.port.local[fillerKey]).toBe('q'.repeat(filler));
    expect(bytes(context.port.local)).toBeLessThan(quota / 2);
    expect((await context.storage.storageInfo()).cleanupPending).toBe(false);
  }, 60_000);
  it('adopts without copying unchanged lists, requires an exact read-back archive, and preserves protected inputs through interrupted cleanup', async () => {
    const context = await previewHistory();
    const workspace = new WorkspaceService(context.storage);
    const review = await workspace.preview(
      JSON.stringify(
        toPortable((await context.storage.requireActiveData()).data),
      ),
      'file',
    );
    await workspace.saveDraft({
      client: token(50),
      sequence: 1,
      base: null,
      lines: ['unfinished input'],
    });
    await context.opening.enqueue({
      kind: 'lines',
      id: token(80),
      lines: ['https://pending.example.test/'],
      windowId: 1,
    });
    context.port.local['buo:v2:snapshot:' + token(900)] = { damaged: true };
    const snapshotHead = (await context.storage.requireActiveData()).head;
    const snapshotData = toPortable(
      (await context.storage.requireActiveData()).data,
    );
    const archivedSnapshotKey =
      'buo:v2:snapshot:' +
      (await digest({ head: snapshotHead, data: snapshotData }));
    context.port.local[archivedSnapshotKey] = {
      schemaVersion: 1,
      head: snapshotHead,
      data: snapshotData,
      createdAt: '2026-11-07T00:00:00.000Z',
    };
    const raw = structuredClone(context.port.local);
    const before = await context.storage.requireActiveData();
    const stale = await context.storage.exportArchive({});
    await mutate(context, 100, {
      kind: 'settings.update',
      patch: { nightMode: before.data.settings.nightMode },
    });
    expect(
      Object.keys(context.port.local).filter((key) =>
        key.startsWith('buo:v2:content:list:'),
      ),
    ).toEqual([]);
    for (const [key, value] of Object.entries(raw))
      if (key !== headKey) expect(context.port.local[key]).toEqual(value);
    await expect(context.storage.compactArchive({}, stale)).rejects.toThrow(
      'ARCHIVE_SOURCES_CHANGED',
    );
    await expect(
      context.storage.compactArchive({}, { ...stale, digest: token(999) }),
    ).rejects.toThrow('RECOVERY_ARCHIVE_INVALID');
    const archive = await context.storage.exportArchive({});
    context.port.removeFailure = true;
    await context.storage.compactArchive({}, archive);
    expect((await context.storage.storageInfo()).cleanupPending).toBe(true);
    for (const key of Object.keys(raw))
      if (key !== headKey) expect(context.port.local[key]).toEqual(raw[key]);
    context.port.removeFailure = false;
    await context.storage.compactArchive({}, archive);
    for (let i = 101; i <= 108; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: before.data.settings.nightMode },
      });
    expect((await context.storage.requireActiveData()).data).toEqual(
      before.data,
    );
    expect(bytes(context.port.local)).toBeLessThan(bytes(raw) / 2);
    for (const [key, value] of Object.entries(raw))
      if (
        !key.startsWith('buo:v2:state:') &&
        key !== headKey &&
        key !== archivedSnapshotKey
      )
        expect(context.port.local[key]).toEqual(value);
    expect(context.port.local[archivedSnapshotKey]).toBeUndefined();
    expect(context.port.local['buo:v2:transfer:' + review.id]).toBeDefined();
    expect((await context.storage.storageInfo()).cleanupPending).toBe(false);
    expect(roots(context)).toHaveLength(2);
    // Restarted readers can verify every retained point without old ancestry.
    const fresh = new StorageCoordinator(context.port, mutex());
    const root = v.parse(
      checkpointSchema,
      context.port.local[
        stateKey((await fresh.requireActiveData()).head.stateDigest)
      ],
    );
    expect(root.base).toBeNull();
    const reader = new CheckpointReader(context.port.local);
    for (const head of root.retained)
      expect((await reader.read(head)).data).toEqual(before.data);
  }, 60_000);
  it('retires only consumed new-format transfer records after they leave recovery retention', async () => {
    const context = await sharedSetup();
    const workspace = new WorkspaceService(context.storage);
    const data = toPortable((await context.storage.requireActiveData()).data);
    const review = await workspace.preview(JSON.stringify(data), 'file');
    await workspace.apply({
      id: review.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions: { acknowledgeIssues: false, preferences: {}, historical: {} },
    });
    const unresolved = await workspace.preview(JSON.stringify(data), 'file');
    for (let i = 2; i <= 9; i++)
      await mutate(context, i, {
        kind: 'settings.update',
        patch: { nightMode: i % 2 === 0 },
      });
    expect(context.port.local['buo:v2:transfer:' + review.id]).toBeUndefined();
    expect(
      context.port.local['buo:v2:transfer:' + unresolved.id],
    ).toBeDefined();
  });
});
