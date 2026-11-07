import * as v from 'valibot';
import {
  type StorageCoordinator,
  readRecoveryStore,
} from './storage/coordinator';
import {
  type CanonicalData,
  type Decisions,
  type Head,
  recoveryExportSchema,
} from '../domain/storage/schema';
import {
  digest,
  jsonValueSchema,
  jsonObjectSchema,
  type JsonValue,
} from '../domain/storage/json';
import {
  analyzeSources,
  createCandidate,
  sameContent,
} from '../domain/storage/migrate';
import {
  legacyExport,
  portableData,
  portableSchema,
  toPortable,
} from '../domain/portable';
import {
  type DraftSave,
  type TransferApply,
  type TransferRecord,
  type TransferReview,
} from '../domain/workspace-schema';
import { MigrationError, requireCondition } from '../domain/storage/errors';

const syncKey = 'bulk-url-opener-v2';
const maxImportBytes = 8 * 1024 * 1024;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const envelopeSchema = v.strictObject({
  schemaVersion: v.literal(1),
  digest: v.string(),
  data: portableSchema,
});

async function inspected(
  raw: JsonValue,
): Promise<Pick<TransferReview, 'portable' | 'legacy'>> {
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.format === 'bulk-url-opener-recovery'
  ) {
    const recovery = v.safeParse(recoveryExportSchema, raw);
    requireCondition(
      recovery.success &&
        (await digest(recovery.output.sources)) === recovery.output.digest,
      'IMPORT_INVALID',
    );
    const data = await readRecoveryStore(recovery.output.sources.storageLocal);
    return data
      ? { portable: toPortable(data), legacy: null }
      : {
          portable: null,
          legacy: await analyzeSources(recovery.output.sources),
        };
  }
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.format === 'bulk-url-opener'
  ) {
    portableData(raw);
    return { portable: v.parse(portableSchema, raw), legacy: null };
  }
  requireCondition(
    raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      Array.isArray(raw.lists) &&
      raw.settings &&
      typeof raw.settings === 'object' &&
      !Array.isArray(raw.settings),
    'IMPORT_INVALID',
  );
  const legacy = await analyzeSources({
    localStorage: {},
    storageLocal: { lists: raw.lists, userSettings: raw.settings },
    storageSync: {},
  });
  for (const key of Object.keys(raw).filter(
    (key) => !['maxID', 'lists', 'settings', 'snapshot_time'].includes(key),
  ))
    legacy.issues.push({
      code: 'unknown-export-field',
      source: 'import.' + key,
      detail:
        'This field is retained in the original import, outside the active library.',
    });
  return { portable: null, legacy };
}
function record(
  baseHead: Head,
  source: TransferRecord['source'],
  raw: unknown,
): TransferRecord {
  const json = v.safeParse(jsonValueSchema, raw);
  requireCondition(json.success, 'IMPORT_INVALID');
  return { schemaVersion: 1, baseHead, source, raw: json.output };
}
function selected(
  review: Pick<TransferReview, 'portable' | 'legacy'>,
  decisions: Decisions,
): Pick<CanonicalData, 'lists' | 'settings'> {
  if (review.portable) return portableData(review.portable);
  requireCondition(review.legacy, 'IMPORT_INVALID');
  return createCandidate(review.legacy, decisions);
}
export class WorkspaceService {
  constructor(
    private readonly storage: StorageCoordinator,
    private readonly now = () => new Date().toISOString(),
  ) {}
  read() {
    return this.storage.withWorkspace(async (store, active) => ({
      ...active,
      draft: await store.draft(active.data.draftLines),
    }));
  }
  saveDraft(input: DraftSave, freeze = false) {
    return this.storage.withWorkspace((store, active) =>
      store.saveDraft(input, active.data.draftLines, freeze),
    );
  }
  draft(id: string) {
    return this.storage.withWorkspace((store) => store.draftSnapshot(id));
  }
  recovered() {
    return this.storage.withWorkspace((store, active) =>
      store.recovered(active.data),
    );
  }
  export(legacy: boolean) {
    return this.storage.withWorkspace((_store, active) =>
      Promise.resolve(
        JSON.stringify(
          legacy ? legacyExport(active.data) : toPortable(active.data),
          null,
          2,
        ),
      ),
    );
  }
  preview(text: string, source: 'paste' | 'file') {
    return this.storage.withWorkspace(async (store, active) => {
      requireCondition(bytes(text) <= maxImportBytes, 'IMPORT_TOO_LARGE');
      let raw: unknown;
      try {
        raw = JSON.parse(text) as unknown;
      } catch {
        throw new MigrationError('IMPORT_INVALID');
      }
      const entry = record(active.head, source, raw);
      const review = await inspected(entry.raw);
      const id = await store.transfer(entry);
      return { id, baseHead: active.head, source, ...review };
    });
  }
  apply(input: TransferApply) {
    return this.storage.withWorkspace(async (store, _active, commit) => {
      requireCondition(input.acknowledgeReplacement, 'REVIEW_REQUIRED');
      const entry = await store.readTransfer(input.id);
      requireCondition(entry.source !== 'sync-upload', 'IMPORT_INVALID');
      const data = selected(await inspected(entry.raw), input.decisions);
      return commit({
        id: input.operation,
        expectedHead: entry.baseHead,
        command: {
          kind: 'library.replace',
          lists: data.lists,
          settings: data.settings,
          sourceDigest: input.id,
        },
      });
    });
  }
  snapshots() {
    return this.storage.withWorkspace((store) => store.snapshots());
  }
  captureSnapshot() {
    return this.storage.withWorkspace((store, active) =>
      store.capture(active.head, active.data, this.now()),
    );
  }
  purgeSnapshots() {
    return this.storage.withWorkspace(async (store) => {
      await store.purgeSnapshots();
      return true;
    });
  }
  archives() {
    return this.storage.withWorkspace(async (store) =>
      (await store.archives()).map(({ id, label }) => ({ id, label })),
    );
  }
  previewSnapshot(id: string, legacy: boolean) {
    return this.storage.withWorkspace(async (store, active) => {
      const archive = legacy
        ? (await store.archives()).find((entry) => entry.id === id)
        : null;
      if (legacy) requireCondition(archive, 'SNAPSHOT_NOT_FOUND');
      const raw = legacy ? archive!.raw : (await store.snapshot(id)).data;
      const source = legacy
        ? ('legacy-snapshot' as const)
        : ('snapshot' as const);
      const entry = record(active.head, source, raw);
      const review = await inspected(entry.raw);
      return {
        id: await store.transfer(entry),
        baseHead: active.head,
        source,
        ...review,
      };
    });
  }
  previewDownload(legacy: boolean) {
    return this.storage.withWorkspace(async (store, active, _commit, sync) => {
      const remote = await sync.read();
      let raw: unknown;
      if (!legacy && Object.hasOwn(remote, syncKey)) {
        const envelope = v.safeParse(envelopeSchema, remote[syncKey]);
        requireCondition(
          envelope.success &&
            (await digest(envelope.output.data)) === envelope.output.digest,
          'SYNC_INVALID',
        );
        raw = envelope.output.data;
      } else {
        requireCondition(Object.hasOwn(remote, 'user_settings'), 'SYNC_EMPTY');
        raw = remote.user_settings;
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw) as unknown;
          } catch {
            throw new MigrationError('SYNC_INVALID');
          }
        }
      }
      const entry = record(active.head, 'sync', raw);
      const review = await inspected(entry.raw);
      return {
        id: await store.transfer(entry),
        baseHead: active.head,
        source: entry.source,
        ...review,
      };
    });
  }
  previewUpload() {
    return this.storage.withWorkspace(async (store, active, _commit, sync) => {
      const remote = v.parse(jsonObjectSchema, await sync.read());
      const data = toPortable(active.data);
      const envelope = { schemaVersion: 1, digest: await digest(data), data };
      // A single key is an atomic local API write; never split a library across
      // mutable sync keys. Leave space below Chromium's 8192-byte item limit.
      const size = bytes(syncKey) + bytes(JSON.stringify(envelope));
      requireCondition(size <= 8000, 'SYNC_TOO_LARGE');
      const entry = record(active.head, 'sync-upload', { remote, envelope });
      return {
        id: await store.transfer(entry),
        lists: data.lists.length,
        bytes: size,
        replacesCopy: Object.hasOwn(remote, syncKey),
        data,
      };
    });
  }
  upload(id: string, beforeWrite: () => Promise<void>) {
    return this.storage.withWorkspace(async (store, active, _commit, sync) => {
      const entry = await store.readTransfer(id);
      requireCondition(
        entry.source === 'sync-upload' &&
          sameContent(entry.baseHead, active.head),
        'REVISION_CONFLICT',
      );
      const payload = v.parse(
        v.strictObject({ remote: jsonObjectSchema, envelope: envelopeSchema }),
        entry.raw,
      );
      requireCondition(
        (await digest(payload.envelope.data)) === payload.envelope.digest,
        'SYNC_INVALID',
      );
      const expected = { ...payload.remote, [syncKey]: payload.envelope };
      const current = await sync.read();
      if (sameContent(expected, current)) return true;
      requireCondition(sameContent(current, payload.remote), 'SYNC_CHANGED');
      await sync.backup(payload.remote);
      // A request may have waited for the writer or for backup verification.
      // Recheck current permission immediately before transmitting the copy.
      await beforeWrite();
      await sync.write({ [syncKey]: payload.envelope });
      requireCondition(
        sameContent((await sync.read())[syncKey], payload.envelope),
        'SYNC_VERIFICATION_FAILED',
      );
      return true;
    });
  }
  diagnostics() {
    return this.storage.withWorkspace((_store, active) =>
      Promise.resolve({
        revision: active.head.revision,
        listCount: active.data.lists.length,
        lineCount: active.data.lists.reduce(
          (n, list) => n + list.lines.length,
          0,
        ),
        settings: {
          ...active.data.settings,
          defaultListOpen: active.data.settings.defaultListOpen.startsWith(
            'list-',
          )
            ? 'saved-list'
            : active.data.settings.defaultListOpen,
          openOnLaunch: active.data.settings.openOnLaunch ? 'saved-list' : null,
        },
      }),
    );
  }
}
