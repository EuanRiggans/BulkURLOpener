import * as v from 'valibot';
import {
  dataSchema,
  hashSchema,
  headSchema,
  deleteListCommandSchema,
  updateSettingsCommandSchema,
  listIdSchema,
} from './schema';

export const checkpointHistoryLimit = 5;
export const checkpointHistoryBytes = 4 * 1024 * 1024;
export const checkpointReceiptLimit = 64;
export const metadataSchema = v.strictObject({
  draftLines: dataSchema.entries.draftLines,
  recoveredInputs: dataSchema.entries.recoveredInputs,
});
const listReferenceSchema = v.strictObject({
  id: listIdSchema,
  digest: hashSchema,
});
const commandSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('list.create'), name: v.string() }),
  v.strictObject({
    kind: v.literal('list.update'),
    id: listIdSchema,
    name: v.string(),
  }),
  deleteListCommandSchema,
  updateSettingsCommandSchema,
  v.strictObject({ kind: v.literal('draft.update') }),
  v.strictObject({
    kind: v.literal('library.replace'),
    sourceDigest: hashSchema,
  }),
]);
export const checkpointReceiptSchema = v.strictObject({
  id: hashSchema,
  requestDigest: hashSchema,
});
export const checkpointSchema = v.strictObject({
  schemaVersion: v.literal(4),
  kind: v.literal('checkpoint'),
  revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  backupDigest: hashSchema,
  stageDigest: hashSchema,
  base: v.nullable(headSchema),
  lists: v.array(listReferenceSchema),
  settings: hashSchema,
  metadata: hashSchema,
  retained: v.pipe(v.array(headSchema), v.maxLength(checkpointHistoryLimit)),
  receipts: v.pipe(
    v.array(checkpointReceiptSchema),
    v.maxLength(checkpointReceiptLimit),
  ),
  operation: v.strictObject({
    id: hashSchema,
    expectedHead: headSchema,
    requestDigest: hashSchema,
    command: commandSchema,
  }),
});
export type Checkpoint = v.InferOutput<typeof checkpointSchema>;
export type CheckpointReceipt = v.InferOutput<typeof checkpointReceiptSchema>;
export const archiveProofSchema = v.strictObject({
  schemaVersion: v.literal(1),
  archiveDigest: hashSchema,
  sourcesDigest: hashSchema,
  records: v.array(v.strictObject({ key: v.string(), digest: hashSchema })),
});
export type ArchiveProof = v.InferOutput<typeof archiveProofSchema>;
export const archiveReceiptSchema = v.strictObject({
  schemaVersion: v.literal(2),
  archiveDigest: hashSchema,
  sourcesDigest: hashSchema,
  completedAt: v.pipe(v.string(), v.isoTimestamp()),
});
export const storageInfoSchema = v.strictObject({
  format: v.picklist(['legacy', 'checkpoint', 'uninitialized', 'unverified']),
  estimatedBytes: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  recoveryPoints: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  archiveableRecords: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  archiveableBytes: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  cleanupPending: v.boolean(),
});
export const recoveryCopiesSchema = v.array(
  v.strictObject({ id: hashSchema, revision: v.number(), lists: v.number() }),
);
