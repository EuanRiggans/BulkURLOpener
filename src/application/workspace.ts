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
  backupSchema,
} from '../domain/storage/schema';
import {
  digest,
  jsonValueSchema,
  type JsonValue,
} from '../domain/storage/json';
import { analyzeSources, createCandidate } from '../domain/storage/migrate';
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
import {
  maxTransportBytes,
  packJson,
  unpackJson,
} from '../domain/storage/archive';

const syncKey = 'bulk-url-opener-v2';
const maxImportBytes = maxTransportBytes;
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const envelopeSchema = v.strictObject({
  schemaVersion: v.literal(1),
  digest: v.string(),
  data: portableSchema,
});

async function inspected(
  raw: JsonValue,
): Promise<Pick<TransferReview, 'portable' | 'legacy'>> {
  // Earlier previews downloaded verified backup records without the format tag.
  const backup = v.safeParse(backupSchema, raw);
  if (backup.success)
    raw = { format: 'bulk-url-opener-recovery', ...backup.output };
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
async function record(
  baseHead: Head,
  source: TransferRecord['source'],
  raw: unknown,
): Promise<TransferRecord> {
  const json = v.safeParse(jsonValueSchema, raw);
  requireCondition(json.success, 'IMPORT_INVALID');
  return {
    schemaVersion: 2,
    baseHead,
    source,
    raw: await packJson(json.output),
  };
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
  constructor(private readonly storage: StorageCoordinator) {}
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
      const original = await unpackJson(raw);
      const entry = await record(active.head, source, original);
      const review = await inspected(original);
      const id = await store.transfer(entry);
      return { id, baseHead: active.head, source, ...review };
    });
  }
  apply(input: TransferApply) {
    return this.storage.withWorkspace(async (store, _active, commit) => {
      requireCondition(input.acknowledgeReplacement, 'REVIEW_REQUIRED');
      const entry = await store.readTransfer(input.id);
      requireCondition(entry.source !== 'sync-upload', 'IMPORT_INVALID');
      const data = selected(
        await inspected(await unpackJson(entry.raw)),
        input.decisions,
      );
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
  archives() {
    return this.storage.withWorkspace(async (store) =>
      (await store.archives()).map(({ id, label }) => ({ id, label })),
    );
  }
  previewArchive(id: string) {
    return this.storage.withWorkspace(async (store, active) => {
      const archive = (await store.archives()).find((entry) => entry.id === id);
      requireCondition(archive, 'SNAPSHOT_NOT_FOUND');
      const source = 'legacy-snapshot' as const;
      const entry = await record(active.head, source, archive.raw);
      const review = await inspected(await unpackJson(entry.raw));
      return {
        id: await store.transfer(entry),
        baseHead: active.head,
        source,
        ...review,
      };
    });
  }
  recoverSync(legacy: boolean) {
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
      const entry = await record(active.head, 'sync', raw);
      const review = await inspected(await unpackJson(entry.raw));
      return {
        id: await store.transfer(entry),
        baseHead: active.head,
        source: entry.source,
        ...review,
      };
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
