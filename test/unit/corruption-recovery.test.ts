import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  StorageCoordinator,
  readRecoveryStore,
} from '../../src/application/storage/coordinator';
import { WorkspaceService } from '../../src/application/workspace';
import { createMigrationListener } from '../../src/application/storage/messages';
import { checkpointSchema } from '../../src/domain/storage/checkpoints';
import {
  recoveryReviewRecordSchema,
  type RecoveryApply,
} from '../../src/domain/storage/recovery';
import { headKey } from '../../src/domain/storage/schema';
import {
  contentKey,
  stateKey,
} from '../../src/application/storage/checkpoints';
import { recoveryReviewKey } from '../../src/application/storage/recovery-records';
import { packJson, unpackJson } from '../../src/domain/storage/archive';
import { toPortable } from '../../src/domain/portable';
import { identity, sender, sharedSetup, token } from './shared-support';
import { reviewed } from './storage-support';

const decisions = { acknowledgeIssues: true, preferences: {}, historical: {} };
async function damaged() {
  const c = await sharedSetup();
  let active = await c.storage.requireActiveData();
  await c.storage.mutate({
    id: token(1),
    expectedHead: active.head,
    command: {
      kind: 'list.create',
      name: 'Synthetic saved list',
      lines: ['https://saved.example.test/exact?x=%252F', ''],
    },
  });
  const healthy = await c.storage.requireActiveData();
  await c.storage.mutate({
    id: token(2),
    expectedHead: healthy.head,
    command: {
      kind: 'list.update',
      id: healthy.data.lists[0]!.id,
      name: 'Synthetic latest list',
      lines: ['https://latest.example.test/', ''],
    },
  });
  active = await c.storage.requireActiveData();
  const root = v.parse(
    checkpointSchema,
    c.port.local[stateKey(active.head.stateDigest)],
  );
  const brokenKey = contentKey('list', root.lists[0]!.digest);
  c.port.local[brokenKey] = { damaged: 'keep exact raw body' };
  return { ...c, healthy, active, brokenKey };
}
async function preview(c: Awaited<ReturnType<typeof damaged>>) {
  const archive = await c.storage.exportArchive({});
  const review = await c.storage.previewRecovery({}, archive, {
    kind: 'copy',
    id: c.healthy.head.stateDigest,
  });
  const input: RecoveryApply = {
    id: review.id,
    operation: token(100),
    decisions,
    acknowledgeReplacement: true,
  };
  return { archive, review, input };
}
describe('explicit corruption recovery', () => {
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'keeps damaged sources intact if preview publication fails: %s',
    async (failure) => {
      const c = await damaged();
      const raw = structuredClone(c.port.local);
      const archive = await c.storage.exportArchive({});
      c.port.failAt = c.port.writes.length + 1;
      c.port.failure = failure;
      await expect(
        c.storage.previewRecovery({}, archive, {
          kind: 'copy',
          id: c.healthy.head.stateDigest,
        }),
      ).rejects.toThrow(/STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/);
      for (const [key, value] of Object.entries(raw))
        expect(c.port.local[key]).toEqual(value);
      expect(c.port.removed).toEqual([]);
    },
  );
  it('restores a selected fallback above all observed revisions, protects raw sources and rejects late editor/open requests', async () => {
    const c = await damaged();
    await expect(c.storage.status()).rejects.toThrow('INTEGRITY_CHECK_FAILED');
    expect(await c.storage.recoveryAvailable()).toEqual({ available: true });
    const original = structuredClone(c.port.local);
    const oldEpoch = '0'.repeat(64);
    const { input } = await preview(c);
    const result = await c.storage.activateRecovery({}, input);
    expect(result.head!.revision).toBeGreaterThan(c.active.head.revision);
    expect(result.data!.lists).toEqual(c.healthy.data.lists);
    for (const [key, value] of Object.entries(original))
      if (key !== headKey) expect(c.port.local[key]).toEqual(value);
    expect(c.port.removed).toEqual([]);
    await expect(
      c.storage.mutate({
        id: token(90),
        expectedHead: c.active.head,
        command: { kind: 'settings.update', patch: { nightMode: true } },
      }),
    ).rejects.toThrow('REVISION_CONFLICT');
    await expect(
      c.opening.enqueue({
        kind: 'lines',
        id: token(99),
        epoch: oldEpoch,
        lines: ['https://late.example.test/'],
      }),
    ).rejects.toThrow('OPEN_REQUEST_EXPIRED');
    expect(c.browser.created).toEqual([]);
    for (let i = 0; i < 10; i++)
      await c.storage.mutate({
        id: token(200 + i),
        expectedHead: (await c.storage.requireActiveData()).head,
        command: { kind: 'settings.update', patch: { nightMode: i % 2 === 0 } },
      });
    expect(await c.storage.pendingMutations()).toEqual([]);
    for (const [key, value] of Object.entries(original))
      if (key !== headKey) expect(c.port.local[key]).toEqual(value);
    const current = await c.storage.status();
    expect(await c.storage.activateRecovery({}, input)).toEqual(current);
    expect(await c.storage.recoveryAvailable()).toEqual({ available: false });
    const exported = await unpackJson(await c.storage.exportArchive({}));
    expect(exported).toBeTruthy();
    expect(await readRecoveryStore(c.port.local)).toEqual(current.data);
    const other = await sharedSetup();
    const workspace = new WorkspaceService(other.storage);
    const imported = await workspace.preview(
      JSON.stringify(await c.storage.exportArchive({})),
      'file',
    );
    await workspace.apply({
      id: imported.id,
      operation: token(800),
      decisions,
      acknowledgeReplacement: true,
    });
    expect(toPortable((await other.storage.requireActiveData()).data)).toEqual(
      toPortable(current.data!),
    );
  });
  it('restores an external portable file with no healthy internal copy and keeps drafts/jobs untouched', async () => {
    const c = await damaged();
    const workspace = new WorkspaceService(c.storage);
    const body = JSON.stringify(toPortable(c.healthy.data));
    const old = v.parse(
      checkpointSchema,
      c.port.local[stateKey(c.healthy.head.stateDigest)],
    );
    delete c.port.local[contentKey('list', old.lists[0]!.digest)];
    c.port.local['buo:v2:draft'] = { damaged: 'draft must remain' };
    const syntheticJobKey = 'buo:v2:job:' + token(999);
    c.port.local[syntheticJobKey] = { damaged: 'unconfirmed work must remain' };
    const originals = structuredClone(c.port.local);
    const archive = await c.storage.exportArchive({});
    const review = await c.storage.previewRecovery({}, archive, {
      kind: 'file',
      text: JSON.stringify(await packJson(JSON.parse(body) as unknown)),
    });
    const result = await c.storage.activateRecovery(
      {},
      {
        id: review.id,
        operation: token(101),
        decisions,
        acknowledgeReplacement: true,
      },
    );
    expect(result.data!.lists[0]!.lines).toEqual(
      c.healthy.data.lists[0]!.lines,
    );
    expect(c.port.local['buo:v2:draft']).toEqual(originals['buo:v2:draft']);
    expect(c.port.local[syntheticJobKey]).toEqual(originals[syntheticJobKey]);
    expect(c.browser.created).toEqual([]);
    const portable = JSON.parse(await workspace.export(false)) as unknown;
    expect(portable).toEqual(toPortable(result.data!));
  });
  it('keeps legacy list identities, source provenance and verified current draft metadata when restoring an internal copy', async () => {
    const c = await sharedSetup({
      localStorage: {},
      storageSync: {},
      storageLocal: {
        lists: [
          {
            object_description: 'list_storage',
            list_id: 7,
            list_name: 'Synthetic migrated list',
            list_links: ['https://legacy-id.example.test/', ''],
          },
        ],
        userSettings: {},
      },
    });
    const healthy = await c.storage.requireActiveData();
    await c.storage.mutate({
      id: token(301),
      expectedHead: healthy.head,
      command: {
        kind: 'draft.update',
        lines: ['https://current-draft.example.test/', ''],
      },
    });
    const drafted = await c.storage.requireActiveData();
    const workspace = new WorkspaceService(c.storage);
    const draft = await workspace.saveDraft({
      client: token(400),
      sequence: 1,
      base: null,
      lines: ['https://working-draft.example.test/', ''],
    });
    await c.storage.mutate({
      id: token(302),
      expectedHead: drafted.head,
      command: {
        kind: 'list.update',
        id: healthy.data.lists[0]!.id,
        name: 'Synthetic update',
        lines: ['https://damaged-update.example.test/'],
      },
    });
    const active = await c.storage.requireActiveData();
    const root = v.parse(
      checkpointSchema,
      c.port.local[stateKey(active.head.stateDigest)],
    );
    c.port.local[contentKey('list', root.lists[0]!.digest)] = null;
    const archive = await c.storage.exportArchive({});
    const review = await c.storage.previewRecovery({}, archive, {
      kind: 'copy',
      id: drafted.head.stateDigest,
    });
    const result = await c.storage.activateRecovery(
      {},
      {
        id: review.id,
        operation: token(303),
        acknowledgeReplacement: true,
        decisions,
      },
    );
    expect(result.data!.lists).toEqual(healthy.data.lists);
    expect(result.data!.lists[0]!.legacyId).toBe(7);
    expect(result.data!.draftLines).toEqual(drafted.data.draftLines);
    expect((await workspace.read()).draft.head).toEqual(draft.current.head);
    expect((await workspace.read()).draft.lines).toEqual([
      'https://working-draft.example.test/',
      '',
    ]);
  });
  it.each(['before', 'after', 'drop'] as const)(
    'keeps the active damaged pointer until verified publication and can retry after %s write faults',
    async (failure) => {
      for (let step = 1; step <= 5; step++) {
        const c = await damaged();
        const raw = structuredClone(c.port.local);
        const { input } = await preview(c);
        c.port.failAt = c.port.writes.length + step;
        c.port.failure = failure;
        await expect(c.storage.activateRecovery({}, input)).rejects.toThrow(
          /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
        );
        if (step < 5 || failure !== 'after')
          expect(c.port.local[headKey]).toEqual(raw[headKey]);
        for (const [key, value] of Object.entries(raw))
          if (key !== headKey) expect(c.port.local[key]).toEqual(value);
        c.port.failAt = 0;
        const restarted = new StorageCoordinator(c.port, c.lock);
        const recovered = await restarted.activateRecovery({}, input);
        expect(recovered.status).toBe('ready');
        expect(recovered.head!.revision).toBeGreaterThan(
          c.active.head.revision,
        );
      }
    },
  );
  it('requires the exact current archive and rejects changed sources or altered decisions on a staged request', async () => {
    const c = await damaged();
    const archive = await c.storage.exportArchive({});
    c.port.local.synthetic = 'changed after archive';
    await expect(
      c.storage.previewRecovery({}, archive, {
        kind: 'copy',
        id: c.healthy.head.stateDigest,
      }),
    ).rejects.toThrow('ARCHIVE_SOURCES_CHANGED');
    delete c.port.local.synthetic;
    const { input } = await preview(c);
    c.port.failAt = c.port.writes.length + 2;
    await expect(c.storage.activateRecovery({}, input)).rejects.toThrow(
      'STORAGE_WRITE_FAILED',
    );
    c.port.failAt = 0;
    await expect(
      c.storage.activateRecovery(
        {},
        { ...input, decisions: { ...decisions, acknowledgeIssues: false } },
      ),
    ).rejects.toThrow('OPERATION_ID_REUSED');
    c.port.local.synthetic = 'changed after review';
    await expect(c.storage.activateRecovery({}, input)).rejects.toThrow(
      'ARCHIVE_SOURCES_CHANGED',
    );
    expect(c.port.local[headKey]).toEqual(c.active.head);
  });
  it('retains corrupt publication bodies and requires a fresh review instead of overwriting them', async () => {
    for (let step = 1; step <= 5; step++) {
      const c = await damaged();
      const raw = structuredClone(c.port.local);
      const { input } = await preview(c);
      c.port.failAt = c.port.writes.length + step;
      c.port.failure = 'corrupt';
      await expect(c.storage.activateRecovery({}, input)).rejects.toThrow(
        'WRITE_VERIFICATION_FAILED',
      );
      c.port.failAt = 0;
      const restarted = new StorageCoordinator(c.port, c.lock);
      await expect(restarted.activateRecovery({}, input)).rejects.toThrow(
        /IMMUTABLE_RECORD_CONFLICT|ARCHIVE_SOURCES_CHANGED|REVISION_CONFLICT/,
      );
      expect(c.port.local[c.brokenKey]).toEqual(raw[c.brokenKey]);
      const archive = await restarted.exportArchive({});
      const reviewedCopy = await restarted.previewRecovery({}, archive, {
        kind: 'copy',
        id: c.healthy.head.stateDigest,
      });
      expect(
        (
          await restarted.activateRecovery(
            {},
            { ...input, id: reviewedCopy.id, operation: token(120 + step) },
          )
        ).status,
      ).toBe('ready');
    }
  });
  it('ignores a stale recovery review after a different recovery wins and preserves the newer data', async () => {
    const c = await damaged();
    const first = await preview(c);
    const secondArchive = await c.storage.exportArchive({});
    const second = await c.storage.previewRecovery({}, secondArchive, {
      kind: 'file',
      text: JSON.stringify(toPortable(c.healthy.data)),
    });
    const winner = await c.storage.activateRecovery(
      {},
      { ...first.input, id: second.id, operation: token(103) },
    );
    await expect(c.storage.activateRecovery({}, first.input)).rejects.toThrow(
      'RECOVERY_NOT_REQUIRED',
    );
    expect(await c.storage.status()).toEqual(winner);
  });
  it.each(['missing', 'malformed'] as const)(
    'can recover a %s active pointer without resetting raw data',
    async (mode) => {
      const c = await damaged();
      if (mode === 'missing') delete c.port.local[headKey];
      else c.port.local[headKey] = null;
      const { input } = await preview(c);
      const result = await c.storage.activateRecovery({}, input);
      expect(result.head!.revision).toBeGreaterThan(c.active.head.revision);
      const proof = v.parse(
        recoveryReviewRecordSchema,
        c.port.local[recoveryReviewKey(input.id)],
      );
      expect(proof.originalHead).toEqual({
        present: mode !== 'missing',
        value: null,
      });
    },
  );
  it('refuses healthy, future-format and unreadable stores without writing recovery records', async () => {
    const c = await sharedSetup();
    const initial = c.port.writes.length;
    expect(await c.storage.recoveryAvailable()).toEqual({ available: false });
    const archive = await c.storage.exportArchive({});
    await expect(
      c.storage.previewRecovery({}, archive, {
        kind: 'copy',
        id: (await c.storage.requireActiveData()).head.stateDigest,
      }),
    ).rejects.toThrow('RECOVERY_NOT_REQUIRED');
    c.port.local[stateKey(token(999))] = {
      schemaVersion: 99,
      opaque: 'future data',
    };
    await expect(c.storage.recoveryAvailable()).rejects.toThrow(
      'UNKNOWN_STORAGE_VERSION',
    );
    expect(c.port.writes).toHaveLength(initial);
    c.port.readFailure = true;
    await expect(c.storage.recoveryAvailable()).rejects.toThrow(
      'STORAGE_READ_FAILED',
    );
    expect(c.port.writes).toHaveLength(initial);
  });
  it('reuses legacy import review choices while keeping the original file protected', async () => {
    const c = await damaged();
    const archive = await c.storage.exportArchive({});
    const review = await c.storage.previewRecovery({}, archive, {
      kind: 'file',
      text: JSON.stringify({
        maxID: '0',
        lists: [
          {
            object_description: 'list_storage',
            list_id: 0,
            list_name: 'Synthetic legacy list',
            list_links: ['https://legacy.example.test/', ''],
          },
        ],
        settings: {},
      }),
    });
    expect(review.legacy).toBeTruthy();
    const restored = await c.storage.activateRecovery(
      {},
      {
        id: review.id,
        operation: token(102),
        acknowledgeReplacement: true,
        decisions: reviewed(review.legacy!),
      },
    );
    expect(restored.data!.lists[0]!.lines).toEqual([
      'https://legacy.example.test/',
      '',
    ]);
    expect(c.port.local[recoveryReviewKey(review.id)]).toBeTruthy();
  });
  it('keeps recovery endpoints restricted to the Data page and the matching window scope', async () => {
    const c = await damaged();
    const listener = createMigrationListener(c.storage, identity);
    const reply = (page: string, privateMode = false) =>
      new Promise((resolve) =>
        listener(
          { type: 'buo:migration/recovery-available' },
          { ...sender(page), tab: { incognito: privateMode } },
          resolve,
        ),
      );
    expect(await reply('options.html')).toEqual({
      ok: false,
      error: 'UNAUTHORIZED_PAGE',
    });
    expect(await reply('popup.html')).toEqual({
      ok: false,
      error: 'UNAUTHORIZED_PAGE',
    });
    expect(await reply('data.html', true)).toEqual({
      ok: false,
      error: 'PRIVATE_WINDOW_UNSUPPORTED',
    });
    expect(await reply('data.html')).toEqual({
      ok: true,
      value: { available: true },
    });
  });
});
