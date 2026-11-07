import * as v from 'valibot';
import { decisionsSchema, hashSchema, type Head } from './schema';
import { jsonValueSchema } from './json';
import { packedJsonSchema } from './archive';
import { metadataSchema } from './checkpoints';

export const recoverySourceSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('copy'), id: hashSchema }),
  v.strictObject({ kind: v.literal('file'), text: v.string() }),
]);
export type RecoverySource = v.InferOutput<typeof recoverySourceSchema>;
export const recoveryReviewRecordSchema = v.strictObject({
  schemaVersion: v.literal(1),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  sourcesDigest: hashSchema,
  archiveDigest: hashSchema,
  originalHead: v.strictObject({
    present: v.boolean(),
    value: jsonValueSchema,
  }),
  originalEpoch: v.strictObject({
    present: v.boolean(),
    value: jsonValueSchema,
  }),
  maxRevision: v.pipe(
    v.number(),
    v.safeInteger(),
    v.minValue(1),
    v.maxValue(Number.MAX_SAFE_INTEGER - 1),
  ),
  protectedKeys: v.array(v.string()),
  raw: packedJsonSchema,
  sourceCopy: v.nullable(hashSchema),
  metadata: metadataSchema,
});
export type RecoveryReviewRecord = v.InferOutput<
  typeof recoveryReviewRecordSchema
>;
export const recoveryStateSchema = v.strictObject({
  schemaVersion: v.literal(5),
  kind: v.literal('recovery'),
  revision: v.pipe(v.number(), v.safeInteger(), v.minValue(2)),
  backupDigest: hashSchema,
  stageDigest: hashSchema,
  reviewDigest: hashSchema,
  operationId: hashSchema,
});
export type RecoveryState = v.InferOutput<typeof recoveryStateSchema>;
export const recoveryApplySchema = v.strictObject({
  id: hashSchema,
  operation: hashSchema,
  decisions: decisionsSchema,
  acknowledgeReplacement: v.literal(true),
});
export type RecoveryApply = v.InferOutput<typeof recoveryApplySchema>;
export const recoveryAvailabilitySchema = v.strictObject({
  available: v.boolean(),
});
export const recoveryPlaceholderHead = (
  revision: number,
  stateDigest: string,
): Head => ({
  schemaVersion: 1,
  revision,
  stateDigest,
});
