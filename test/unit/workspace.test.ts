import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { WorkspaceService } from '../../src/application/workspace';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import {
  portableData,
  toPortable,
  legacyExport as exportLegacy,
} from '../../src/domain/portable';
import { defaultSettings } from '../../src/domain/storage/migrate';
import { digest } from '../../src/domain/storage/json';
import { headKey, type Decisions } from '../../src/domain/storage/schema';
import { draftResultSchema } from '../../src/domain/workspace-schema';
import { legacyExport, reviewed, empty } from './storage-support';
import { sender, sharedSetup, token } from './shared-support';
import { MigrationError } from '../../src/domain/storage/errors';

const decisions: Decisions = {
  acknowledgeIssues: false,
  preferences: {},
  historical: {},
};
const sample = () => ({
  format: 'bulk-url-opener' as const,
  version: 2 as const,
  lists: [
    {
      id: 'list-' + token(700),
      name: 'Synthetic & café <list>',
      lines: [
        'https://example.test/?q=%2526&a=one,two',
        'a query & # café',
        '',
      ],
    },
  ],
  settings: {
    ...defaultSettings,
    defaultListOpen: 'list-' + token(700),
    openOnLaunch: 'list-' + token(700),
    tabCreationDelay: 0.125,
  },
});
async function setup() {
  const context = await sharedSetup();
  return { ...context, workspace: new WorkspaceService(context.storage) };
}
async function changed(
  context: Awaited<ReturnType<typeof setup>>,
  operation: number,
  patch = { nightMode: true },
) {
  return context.storage.mutate({
    id: token(operation),
    expectedHead: (await context.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch },
  });
}

describe('portable transfer and reviewed replacement', () => {
  it('rejects missing replacement provenance before staging any state or snapshot', async () => {
    const { storage, port } = await setup();
    const active = await storage.requireActiveData();
    const writes = port.writes.length;
    await expect(
      storage.mutate({
        id: token(1),
        expectedHead: active.head,
        command: {
          kind: 'library.replace',
          lists: [],
          settings: active.data.settings,
          sourceDigest: token(999),
        },
      }),
    ).rejects.toThrow('INTEGRITY_CHECK_FAILED');
    expect(port.writes).toHaveLength(writes);
    expect(await storage.pendingMutations()).toEqual([]);
    expect(await storage.requireActiveData()).toEqual(active);
  });
  it('round-trips modern and legacy exports with all settings, ID zero, Unicode and exact lines', async () => {
    const source = legacyExport('zero-id-export');
    const { storage } = await sharedSetup(source);
    const data = (await storage.requireActiveData()).data;
    expect(portableData(toPortable(data)).settings).toEqual(data.settings);
    const old = exportLegacy(data);
    const context = await setup();
    const preview = await context.workspace.preview(
      JSON.stringify(old),
      'paste',
    );
    expect(preview.legacy!.lists.some((list) => list.legacyId === 0)).toBe(
      true,
    );
    const result = await context.workspace.apply({
      id: preview.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions: reviewed(preview.legacy!),
    });
    expect(
      result.data!.lists.map((list) => [list.legacyId, list.name, list.lines]),
    ).toEqual(data.lists.map((list) => [list.legacyId, list.name, list.lines]));
    expect(result.data!.settings).toEqual(data.settings);
    const beforeZero = {
      ...data,
      lists: [
        { ...data.lists[0]!, id: 'list-' + token(555), legacyId: null },
        ...data.lists,
      ],
    };
    const encoded = exportLegacy(beforeZero) as {
      lists: { list_id: number }[];
    };
    expect(encoded.lists[1]!.list_id).toBe(0);
    expect(new Set(encoded.lists.map((list) => list.list_id)).size).toBe(
      encoded.lists.length,
    );
  });
  it('rejects invalid formats and invalid references without changing the active library', async () => {
    const { workspace, storage } = await setup();
    const before = await storage.requireActiveData();
    for (const value of [
      '{',
      '{}',
      JSON.stringify({ ...sample(), version: 3 }),
      JSON.stringify({ ...sample(), lists: [] }),
      JSON.stringify({
        ...sample(),
        lists: [...sample().lists, ...sample().lists],
      }),
    ])
      await expect(workspace.preview(value, 'paste')).rejects.toThrow(
        'IMPORT_INVALID',
      );
    expect(await storage.requireActiveData()).toEqual(before);
    await expect(
      workspace.preview(' '.repeat(8 * 1024 * 1024 + 1), 'file'),
    ).rejects.toThrow('IMPORT_TOO_LARGE');
  });
  it('keeps a preview immutable, preserves working input and never opens restored startup lists', async () => {
    const { workspace, storage, browser, port } = await setup();
    await workspace.saveDraft({
      client: token(3),
      sequence: 1,
      base: null,
      lines: ['Unfinished café', ''],
    });
    const preview = await workspace.preview(JSON.stringify(sample()), 'file');
    expect((await storage.requireActiveData()).data.lists).toEqual([]);
    const original = structuredClone(
      port.local['buo:v2:transfer:' + preview.id],
    );
    const input = {
      id: preview.id,
      operation: token(1),
      acknowledgeReplacement: true as const,
      decisions,
    };
    const result = await workspace.apply(input);
    expect(result.data!.settings).toEqual(sample().settings);
    expect(result.data!.lists[0]!.lines).toEqual(sample().lists[0]!.lines);
    expect((await workspace.read()).draft.lines).toEqual([
      'Unfinished café',
      '',
    ]);
    expect(port.local['buo:v2:transfer:' + preview.id]).toEqual(original);
    expect(browser.created).toEqual([]);
    expect(await workspace.apply(input)).toEqual(result);
    expect(await workspace.export(false)).not.toContain('Unfinished');
  });
  it('rejects stale replacement, then supports a fresh review without discarding the winner', async () => {
    const context = await setup();
    const preview = await context.workspace.preview(
      JSON.stringify(sample()),
      'paste',
    );
    await changed(context, 1);
    await expect(
      context.workspace.apply({
        id: preview.id,
        operation: token(2),
        acknowledgeReplacement: true,
        decisions,
      }),
    ).rejects.toThrow('REVISION_CONFLICT');
    expect((await context.workspace.read()).data.settings.nightMode).toBe(true);
  });
  it('requires acknowledgement of damaged legacy records and retains their raw values', async () => {
    const { workspace, port } = await setup();
    const raw = {
      lists: [{ broken: 'retained raw value' }],
      settings: {},
      unfamiliar: { source: 'preserved' },
    };
    const review = await workspace.preview(JSON.stringify(raw), 'paste');
    expect(review.legacy!.issues.length).toBeGreaterThan(0);
    await expect(
      workspace.apply({
        id: review.id,
        operation: token(1),
        acknowledgeReplacement: true,
        decisions,
      }),
    ).rejects.toThrow('REVIEW_REQUIRED');
    expect(port.local['buo:v2:transfer:' + review.id]).toMatchObject({ raw });
  });
  it.each(['before', 'after', 'drop'] as const)(
    'recovers replacement publication failure without losing the old library: %s',
    async (failure) => {
      const {
        workspace,
        storage,
        port,
        lock,
        review: originalReview,
      } = await setup();
      const before = await storage.requireActiveData();
      const review = await workspace.preview(JSON.stringify(sample()), 'paste');
      const input = {
        id: review.id,
        operation: token(1),
        acknowledgeReplacement: true as const,
        decisions,
      };
      port.failKey = headKey;
      port.failure = failure;
      await expect(workspace.apply(input)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      port.failKey = null;
      const restarted = new WorkspaceService(
        new StorageCoordinator(port, lock),
      );
      if (failure !== 'after')
        expect((await restarted.read()).head).toEqual(before.head);
      expect((await restarted.apply(input)).data!.lists[0]!.lines).toEqual(
        sample().lists[0]!.lines,
      );
      expect(
        (await storage.backup(originalReview.backupDigest)).sources,
      ).toEqual(empty);
    },
  );
  it('imports a verified recovery file using its latest canonical state and rejects a mismatched checksum', async () => {
    const first = await setup();
    await first.storage.mutate({
      id: token(1),
      expectedHead: (await first.storage.requireActiveData()).head,
      command: {
        kind: 'list.create',
        name: 'Canonical version',
        lines: ['https://canonical.example.test/'],
      },
    });
    const recovery = await first.storage.exportRecovery({});
    const second = await setup();
    const review = await second.workspace.preview(
      JSON.stringify(recovery),
      'file',
    );
    expect(review.portable!.lists[0]!.name).toBe('Canonical version');
    recovery.digest = token(0);
    await expect(
      second.workspace.preview(JSON.stringify(recovery), 'file'),
    ).rejects.toThrow('IMPORT_INVALID');
  });
});

describe('working drafts', () => {
  it('resolves a popup without sender.tab before accepting private-window draft writes', async () => {
    const { services, browser, port } = await setup();
    browser.targetHook = () =>
      Promise.reject(new MigrationError('PRIVATE_WINDOW_UNSUPPORTED'));
    const { id, url } = sender('popup.html');
    await expect(
      services.dispatch({ type: 'buo:service/workspace.read' }, { id, url }),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    await expect(
      services.dispatch(
        {
          type: 'buo:service/draft.save',
          input: {
            client: token(1),
            sequence: 1,
            base: null,
            lines: ['not persisted'],
          },
        },
        { id, url },
      ),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    expect(port.local['buo:v2:draft']).toBeUndefined();
  });
  it('keeps typing in one verified record without full-library history or unbounded text copies', async () => {
    const { workspace, port, storage } = await setup();
    const head = (await storage.requireActiveData()).head;
    for (let sequence = 1; sequence <= 60; sequence++)
      await workspace.saveDraft({
        client: token(1),
        sequence,
        base: null,
        lines: ['café & %25', String(sequence), ''],
      });
    expect((await workspace.read()).draft.lines).toEqual([
      'café & %25',
      '60',
      '',
    ]);
    expect((await storage.requireActiveData()).head).toEqual(head);
    expect(
      Object.keys(port.local).filter((key) =>
        key.startsWith('buo:v2:draft-state:'),
      ),
    ).toEqual([]);
    expect(
      Object.keys(port.local).filter((key) => key.startsWith('buo:v2:state:')),
    ).toHaveLength(1);
  });
  it('retains conflicting drafts, freezes editor handoffs and refuses reused sequence numbers', async () => {
    const { workspace } = await setup();
    const first = {
      client: token(1),
      sequence: 1,
      base: null,
      lines: ['First draft'],
    };
    const accepted = await workspace.saveDraft(first, true);
    const conflict = await workspace.saveDraft(
      { client: token(2), sequence: 1, base: null, lines: ['Other draft'] },
      true,
    );
    expect(conflict.saved).toBe(false);
    expect((await workspace.read()).draft.lines).toEqual(first.lines);
    expect(await workspace.draft(conflict.submitted)).toEqual(['Other draft']);
    expect((await workspace.recovered())[0]!.lines).toEqual(['Other draft']);
    await workspace.saveDraft({ ...first, sequence: 3, lines: ['Latest'] });
    await workspace.saveDraft({
      ...first,
      sequence: 2,
      lines: ['Old request'],
    });
    expect((await workspace.read()).draft.lines).toEqual(['Latest']);
    expect(await workspace.draft(accepted.submitted)).toEqual(first.lines);
    await expect(
      workspace.saveDraft({
        ...first,
        sequence: 3,
        lines: ['Different payload'],
      }),
    ).rejects.toThrow('OPERATION_ID_REUSED');
  });
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'reports failed draft acknowledgement without resetting to defaults: %s',
    async (failure) => {
      const { workspace, port } = await setup();
      port.failKey = 'buo:v2:draft';
      port.failure = failure;
      await expect(
        workspace.saveDraft({
          client: token(1),
          sequence: 1,
          base: null,
          lines: ['Keep in the UI'],
        }),
      ).rejects.toThrow(/STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/);
      if (failure === 'corrupt')
        await expect(workspace.read()).rejects.toThrow(
          'WORKSPACE_INTEGRITY_FAILED',
        );
    },
  );
});

describe('optional snapshots', () => {
  it('never prunes older snapshots when the replacement copy fails verification', async () => {
    const context = await setup();
    for (let id = 1; id <= 5; id++)
      await changed(context, id, { nightMode: id % 2 === 1 });
    const before = await context.workspace.snapshots();
    const head = (await context.storage.requireActiveData()).head;
    context.port.failAt = context.port.writes.length + 1;
    context.port.failure = 'corrupt';
    await expect(changed(context, 6)).rejects.toThrow(
      'WRITE_VERIFICATION_FAILED',
    );
    expect((await context.workspace.snapshots()).records).toEqual(
      before.records,
    );
    expect(context.port.removed).toEqual([]);
    expect((await context.storage.requireActiveData()).head).toEqual(head);
  });
  it('bounds new retention, supports review/restore and never purges original sources or canonical history', async () => {
    const context = await setup();
    for (let id = 1; id <= 8; id++)
      await changed(context, id, { nightMode: id % 2 === 1 });
    const records = await context.workspace.snapshots();
    expect(records.records).toHaveLength(5);
    const snapshot = records.records[0]!;
    const preview = await context.workspace.previewSnapshot(snapshot.id, false);
    expect(preview.portable!.settings.nightMode).toBe(true);
    const head = (await context.storage.requireActiveData()).head;
    const before = Object.keys(context.port.local).filter(
      (key) => !key.startsWith('buo:v2:snapshot:'),
    );
    await context.workspace.purgeSnapshots();
    expect((await context.workspace.snapshots()).records).toEqual([]);
    expect(Object.keys(context.port.local)).toEqual(before);
    expect((await context.storage.requireActiveData()).head).toEqual(head);
  });
  it('disabling automatic snapshots retains existing copies and still permits an explicit capture', async () => {
    const context = await setup();
    await context.storage.mutate({
      id: token(1),
      expectedHead: (await context.storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { disableSnapshots: true } },
    });
    const count = (await context.workspace.snapshots()).records.length;
    await changed(context, 2);
    expect((await context.workspace.snapshots()).records).toHaveLength(count);
    await context.workspace.captureSnapshot();
    expect((await context.workspace.snapshots()).records).toHaveLength(
      count + 1,
    );
  });
  it('retains damaged snapshots and extra verified copies when pruning fails', async () => {
    const context = await setup();
    context.port.removeFailure = true;
    context.port.local['buo:v2:snapshot:' + token(999)] = { damaged: true };
    for (let id = 1; id <= 6; id++)
      await changed(context, id, { nightMode: id % 2 === 1 });
    expect((await context.workspace.snapshots()).damaged).toBe(1);
    expect((await context.workspace.snapshots()).records).toHaveLength(6);
    context.port.removeFailure = false;
    await context.workspace.purgeSnapshots();
    expect(context.port.local['buo:v2:snapshot:' + token(999)]).toEqual({
      damaged: true,
    });
  });
  it('makes original legacy archive payloads individually reviewable without activating them', async () => {
    const { storage } = await sharedSetup(legacyExport('zero-id-export'));
    const raw = exportLegacy((await storage.requireActiveData()).data);
    const source = {
      ...empty,
      localStorage: {
        storage_snapshots: JSON.stringify({ backups: [JSON.stringify(raw)] }),
      },
    };
    const { storage: migrated } = await sharedSetup(source);
    const workspace = new WorkspaceService(migrated);
    const archive = (await workspace.archives())[0]!;
    expect(
      (await workspace.previewSnapshot(archive.id, true)).legacy!.lists.length,
    ).toBeGreaterThan(0);
    expect((await workspace.read()).data.lists).toEqual([]);
  });
});

describe('manual browser-account sync', () => {
  it('checks Firefox transmission consent before any sync write', async () => {
    const context = await setup();
    const review = await context.workspace.previewUpload();
    context.browser.allowTransmission = (purpose) => {
      expect(purpose).toBe('sync');
      return Promise.reject(new MigrationError('SYNC_CONSENT_REQUIRED'));
    };
    await expect(
      context.services.dispatch(
        { type: 'buo:service/sync.upload', id: review.id, acknowledge: true },
        sender('data.html'),
      ),
    ).rejects.toThrow('SYNC_CONSENT_REQUIRED');
    expect(context.port.syncWrites).toBe(0);
  });
  it('preserves the legacy key, verifies the new copy and restores only the reviewed download', async () => {
    const context = await setup();
    context.port.sync = {
      user_settings: 'retained legacy source',
      unrelated: { safe: true },
    };
    const before = structuredClone(context.port.sync);
    const upload = await context.workspace.previewUpload();
    await context.workspace.upload(upload.id);
    expect(context.port.sync).toMatchObject(before);
    expect(
      context.port.local['buo:v2:sync-backup:' + (await digest(before))],
    ).toEqual(before);
    const download = await context.workspace.previewDownload(false);
    context.port.sync = { changed: true };
    await context.workspace.apply({
      id: download.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions,
    });
    expect((await context.workspace.read()).data.lists).toEqual([]);
  });
  it('rejects changed sync/local state after preview and never silently overwrites it', async () => {
    const context = await setup();
    const upload = await context.workspace.previewUpload();
    context.port.sync = { fromOtherDevice: true };
    await expect(context.workspace.upload(upload.id)).rejects.toThrow(
      'SYNC_CHANGED',
    );
    expect(context.port.syncWrites).toBe(0);
    const next = await context.workspace.previewUpload();
    await changed(context, 1);
    await expect(context.workspace.upload(next.id)).rejects.toThrow(
      'REVISION_CONFLICT',
    );
  });
  it.each(['before', 'after', 'drop', 'corrupt'] as const)(
    'reports failed sync writes and permits idempotent retry after lost acknowledgement: %s',
    async (failure) => {
      const context = await setup();
      const upload = await context.workspace.previewUpload();
      context.port.syncFailure = failure;
      await expect(context.workspace.upload(upload.id)).rejects.toThrow(
        /SYNC_WRITE_FAILED|SYNC_VERIFICATION_FAILED/,
      );
      context.port.syncFailure = null;
      if (failure === 'after') {
        await context.workspace.upload(upload.id);
        expect(context.port.syncWrites).toBe(1);
      }
      expect((await context.workspace.read()).data.lists).toEqual([]);
    },
  );
  it('detects corrupt downloads, enforces per-item quota and keeps larger libraries exportable', async () => {
    const context = await setup();
    context.port.sync = {
      'bulk-url-opener-v2': {
        schemaVersion: 1,
        digest: token(0),
        data: sample(),
      },
    };
    await expect(context.workspace.previewDownload(false)).rejects.toThrow(
      'SYNC_INVALID',
    );
    const large = sample();
    large.lists[0]!.lines = ['https://example.test/' + 'x'.repeat(10_000)];
    const preview = await context.workspace.preview(
      JSON.stringify(large),
      'paste',
    );
    await context.workspace.apply({
      id: preview.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions,
    });
    await expect(context.workspace.previewUpload()).rejects.toThrow(
      'SYNC_TOO_LARGE',
    );
    expect(await context.workspace.export(false)).toContain('x'.repeat(10_000));
  });
  it('authorizes transfer, draft and diagnostics endpoints by page and blocks private senders before writes', async () => {
    const { services, port } = await setup();
    await expect(
      services.dispatch(
        {
          type: 'buo:service/data.preview',
          text: JSON.stringify(sample()),
          source: 'paste',
        },
        sender('popup.html'),
      ),
    ).rejects.toThrow('UNAUTHORIZED_PAGE');
    await expect(
      services.dispatch(
        { type: 'buo:service/sync.preview-upload' },
        { ...sender('data.html'), tab: { incognito: true } },
      ),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    expect(port.syncWrites).toBe(0);
    const result = v.parse(
      draftResultSchema,
      await services.dispatch(
        {
          type: 'buo:service/draft.freeze',
          input: {
            client: token(1),
            sequence: 1,
            base: null,
            lines: ['https://example.test/'],
          },
        },
        sender('tools.html'),
      ),
    );
    expect(result.saved).toBe(true);
  });
  it('redacts personal list references and excludes content from diagnostics', async () => {
    const context = await setup();
    const preview = await context.workspace.preview(
      JSON.stringify(sample()),
      'paste',
    );
    await context.workspace.apply({
      id: preview.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions,
    });
    const report = JSON.stringify(await context.workspace.diagnostics());
    expect(report).toContain('saved-list');
    expect(report).not.toContain('Synthetic');
    expect(report).not.toContain('example.test');
    expect(report).not.toContain(token(700));
  });
});
