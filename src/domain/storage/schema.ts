import * as v from 'valibot';
import { jsonObjectSchema, jsonValueSchema, stringRecordSchema } from './json';

export const storagePrefix = 'buo:v2:';
export const headKey = storagePrefix + 'head';
export const hashSchema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/));
export const listIdSchema = v.pipe(v.string(), v.regex(/^list-[a-f0-9]{64}$/));
const natural = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const revision = v.pipe(natural, v.minValue(1));
const lines = v.array(v.string());

export const documentSchema = stringRecordSchema;
export const sourcesSchema = v.strictObject({
  localStorage: documentSchema,
  storageLocal: jsonObjectSchema,
  storageSync: jsonObjectSchema,
});
export type Sources = v.InferOutput<typeof sourcesSchema>;

export const settingsSchema = v.strictObject({
  tabCreationDelay: v.pipe(v.number(), v.finite(), v.minValue(0)),
  nightMode: v.boolean(),
  autoOpenLists: v.boolean(),
  defaultListOpen: v.union([
    v.picklist(['current-tabs', 'previous-input']),
    listIdSchema,
  ]),
  customTheme: v.picklist(['defaultBootstrap', 'fluentDesignBootstrap']),
  currentlyOpenedTabsDisplay: v.picklist(['currentWindow', 'allOpenedTabs']),
  nonUrlHandler: v.picklist([
    'searchForString',
    'ignoreString',
    'attemptToExtractURL',
  ]),
  searchEngine: v.picklist(['googleEngine', 'duckduckgoEngine', 'bingEngine']),
  newTabsActive: v.boolean(),
  autoLoadIntoTextarea: v.boolean(),
  buttonLook: v.picklist([
    'alwaysOutline',
    'alwaysFilled',
    'filledNight',
    'filledLight',
  ]),
  openOnLaunch: v.nullable(listIdSchema),
  loadOnFocus: v.boolean(),
  contextMenuEnabled: v.boolean(),
  openUrlsInReverseOrder: v.boolean(),
  automaticallyRemoveDuplicateUrls: v.boolean(),
  disableSnapshots: v.boolean(),
});
export type Settings = v.InferOutput<typeof settingsSchema>;
export const settingKeys = Object.keys(
  settingsSchema.entries,
) as (keyof Settings)[];
export const settingKeySchema = v.picklist(settingKeys);

const legacyListSchema = v.strictObject({
  id: listIdSchema,
  legacyId: natural,
  name: v.string(),
  lines,
  sources: v.array(v.string()),
});
export const listSchema = v.strictObject({
  ...legacyListSchema.entries,
  legacyId: v.nullable(natural),
});
export type SavedList = v.InferOutput<typeof listSchema>;
const recoveredInputSchema = v.strictObject({
  kind: v.picklist(['new-list-draft', 'pending-opening']),
  lines,
  source: v.string(),
});

export const dataSchema = v.pipe(
  v.strictObject({
    lists: v.array(listSchema),
    settings: settingsSchema,
    draftLines: v.nullable(lines),
    recoveredInputs: v.array(recoveredInputSchema),
  }),
  v.check((data) => {
    const ids = new Set(data.lists.map((list) => list.id));
    return (
      ids.size === data.lists.length &&
      (data.settings.openOnLaunch === null ||
        ids.has(data.settings.openOnLaunch)) &&
      (['current-tabs', 'previous-input'].includes(
        data.settings.defaultListOpen,
      ) ||
        ids.has(data.settings.defaultListOpen))
    );
  }, 'List identities and setting references must be consistent.'),
);
export type CanonicalData = v.InferOutput<typeof dataSchema>;

export const planSchema = v.strictObject({
  lists: v.array(
    v.strictObject({ ...legacyListSchema.entries, reconstructed: v.boolean() }),
  ),
  preferences: v.array(
    v.strictObject({
      key: settingKeySchema,
      options: v.array(
        v.strictObject({
          id: hashSchema,
          value: jsonValueSchema,
          sources: v.array(v.string()),
        }),
      ),
    }),
  ),
  issues: v.array(
    v.strictObject({
      code: v.string(),
      source: v.string(),
      detail: v.string(),
    }),
  ),
  archives: v.array(
    v.strictObject({
      kind: v.picklist(['snapshot', 'sync']),
      source: v.string(),
      listCount: natural,
      valid: v.boolean(),
    }),
  ),
  draftLines: v.nullable(lines),
  recoveredInputs: v.array(recoveredInputSchema),
});
export type MigrationPlan = v.InferOutput<typeof planSchema>;
export const decisionsSchema = v.strictObject({
  acknowledgeIssues: v.boolean(),
  preferences: v.pipe(
    stringRecordSchema,
    v.check((record) =>
      Object.values(record).every((value) => v.is(hashSchema, value)),
    ),
  ),
  historical: v.pipe(
    stringRecordSchema,
    v.check((record) =>
      Object.values(record).every(
        (value) => value === 'include' || value === 'archive-only',
      ),
    ),
  ),
});
export type Decisions = v.InferOutput<typeof decisionsSchema>;

export const headSchema = v.strictObject({
  schemaVersion: v.literal(1),
  revision,
  stateDigest: hashSchema,
});
export type Head = v.InferOutput<typeof headSchema>;
export const backupSchema = v.strictObject({
  schemaVersion: v.literal(1),
  capturedAt: v.pipe(v.string(), v.isoTimestamp()),
  digest: hashSchema,
  sources: sourcesSchema,
});
export type Backup = v.InferOutput<typeof backupSchema>;
export const stageSchema = v.strictObject({
  schemaVersion: v.literal(1),
  backupDigest: hashSchema,
  baseHead: v.nullable(headSchema),
  decisions: decisionsSchema,
  data: dataSchema,
});
export type Stage = v.InferOutput<typeof stageSchema>;
export const libraryCommandSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('list.create'), name: v.string(), lines }),
  v.strictObject({
    kind: v.literal('list.update'),
    id: listIdSchema,
    name: v.string(),
    lines,
  }),
  v.strictObject({ kind: v.literal('list.delete'), id: listIdSchema }),
  v.strictObject({
    kind: v.literal('settings.update'),
    patch: v.partial(settingsSchema),
  }),
  v.strictObject({ kind: v.literal('draft.update'), lines: v.nullable(lines) }),
]);
export type LibraryCommand = v.InferOutput<typeof libraryCommandSchema>;
export const operationSchema = v.strictObject({
  id: hashSchema,
  command: libraryCommandSchema,
  requestDigest: hashSchema,
});
export const mutationInputSchema = v.strictObject({
  id: hashSchema,
  expectedHead: headSchema,
  command: libraryCommandSchema,
});
export type MutationInput = v.InferOutput<typeof mutationInputSchema>;
export const migrationStateSchema = v.strictObject({
  schemaVersion: v.literal(1),
  revision,
  kind: v.picklist(['migration', 'rollback']),
  previous: v.nullable(headSchema),
  backupDigest: hashSchema,
  stageDigest: hashSchema,
  restoreTarget: v.nullable(headSchema),
  data: v.nullable(dataSchema),
});
export type MigrationState = v.InferOutput<typeof migrationStateSchema>;
export const mutationStateSchema = v.strictObject({
  ...migrationStateSchema.entries,
  schemaVersion: v.literal(2),
  kind: v.literal('mutation'),
  previous: headSchema,
  restoreTarget: v.null(),
  data: dataSchema,
  operation: operationSchema,
});
export const stateSchema = v.union([migrationStateSchema, mutationStateSchema]);
export type StoredState = v.InferOutput<typeof stateSchema>;
export const reviewSchema = v.strictObject({
  backupDigest: hashSchema,
  baseHead: v.nullable(headSchema),
  resumeDecisions: v.nullable(decisionsSchema),
  plan: planSchema,
});
export type MigrationReview = v.InferOutput<typeof reviewSchema>;

export const statusSchema = v.strictObject({
  status: v.picklist(['uninitialized', 'ready', 'rolled-back']),
  head: v.nullable(headSchema),
  data: v.nullable(dataSchema),
  canRollback: v.boolean(),
});
export type StorageStatus = v.InferOutput<typeof statusSchema>;

export const recoveryExportSchema = v.strictObject({
  format: v.literal('bulk-url-opener-recovery'),
  schemaVersion: v.literal(1),
  capturedAt: v.pipe(v.string(), v.isoTimestamp()),
  digest: hashSchema,
  sources: sourcesSchema,
});
export type RecoveryExport = v.InferOutput<typeof recoveryExportSchema>;
