import * as v from 'valibot';
import {
  dataSchema,
  decisionsSchema,
  hashSchema,
  headSchema,
  planSchema,
  settingsSchema,
} from './storage/schema';
import { jsonValueSchema } from './storage/json';
import { portableSchema } from './portable';

const natural = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const draftSaveSchema = v.strictObject({
  client: hashSchema,
  sequence: v.pipe(natural, v.minValue(1)),
  base: v.nullable(hashSchema),
  lines: v.array(v.string()),
});
export type DraftSave = v.InferOutput<typeof draftSaveSchema>;
export const draftRecordSchema = v.strictObject({
  schemaVersion: v.literal(1),
  previous: v.nullable(hashSchema),
  client: hashSchema,
  sequence: natural,
  lines: v.array(v.string()),
  conflict: v.boolean(),
});
export const draftHeadSchema = v.strictObject({
  schemaVersion: v.literal(1),
  digest: hashSchema,
  record: draftRecordSchema,
});
export const appearanceSchema = v.pick(settingsSchema, [
  'nightMode',
  'customTheme',
  'buttonLook',
]);
export const draftViewSchema = v.strictObject({
  head: v.nullable(hashSchema),
  lines: v.nullable(v.array(v.string())),
});
export const draftResultSchema = v.strictObject({
  saved: v.boolean(),
  submitted: hashSchema,
  current: draftViewSchema,
});
export const workspaceSchema = v.strictObject({
  head: headSchema,
  data: dataSchema,
  draft: draftViewSchema,
});
export type Workspace = v.InferOutput<typeof workspaceSchema>;
export const snapshotSchema = v.strictObject({
  schemaVersion: v.literal(1),
  head: headSchema,
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  data: portableSchema,
});
export const snapshotSummarySchema = v.strictObject({
  id: hashSchema,
  revision: natural,
  createdAt: v.string(),
  lists: natural,
});
export const snapshotListSchema = v.strictObject({
  records: v.array(snapshotSummarySchema),
  damaged: natural,
});
export const transferRecordSchema = v.strictObject({
  schemaVersion: v.literal(1),
  baseHead: headSchema,
  source: v.picklist([
    'paste',
    'file',
    'sync',
    'snapshot',
    'legacy-snapshot',
    'sync-upload',
  ]),
  raw: jsonValueSchema,
});
export type TransferRecord = v.InferOutput<typeof transferRecordSchema>;
export const transferReviewSchema = v.strictObject({
  id: hashSchema,
  baseHead: headSchema,
  source: transferRecordSchema.entries.source,
  portable: v.nullable(portableSchema),
  legacy: v.nullable(planSchema),
});
export type TransferReview = v.InferOutput<typeof transferReviewSchema>;
export const transferApplySchema = v.strictObject({
  id: hashSchema,
  operation: hashSchema,
  acknowledgeReplacement: v.literal(true),
  decisions: decisionsSchema,
});
export type TransferApply = v.InferOutput<typeof transferApplySchema>;
export const recoveredInputSchema = v.strictObject({
  id: v.string(),
  label: v.string(),
  lines: v.array(v.string()),
});
export const archiveSummarySchema = v.strictObject({
  id: hashSchema,
  label: v.string(),
});
export const syncUploadReviewSchema = v.strictObject({
  id: hashSchema,
  lists: natural,
  bytes: natural,
  replacesCopy: v.boolean(),
  data: portableSchema,
});
