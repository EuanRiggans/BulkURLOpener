import * as v from 'valibot';
import {
  recoveryReviewRecordSchema,
  recoveryStateSchema,
} from '../../domain/storage/recovery';
import {
  backupSchema,
  stageSchema,
  headKey,
  headSchema,
  type Head,
} from '../../domain/storage/schema';
import { digest, plainObject } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import { checkpointSchema } from '../../domain/storage/checkpoints';

type Store = Record<string, unknown>;
export const recoveryReviewKey = (hash: string) =>
  'buo:v2:recovery-review:' + hash;
export function isRecoveryState(raw: unknown) {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    'schemaVersion' in raw &&
    raw.schemaVersion === 5
  );
}
export async function readRecoveryReview(store: Store, hash: string) {
  const parsed = v.safeParse(
    recoveryReviewRecordSchema,
    store[recoveryReviewKey(hash)],
  );
  requireCondition(
    parsed.success && (await digest(parsed.output)) === hash,
    'RECOVERY_REVIEW_INVALID',
  );
  return parsed.output;
}
export async function readRecoveryState(store: Store, ref: Head) {
  const parsed = v.safeParse(
    recoveryStateSchema,
    store['buo:v2:state:' + ref.stateDigest],
  );
  requireCondition(
    parsed.success &&
      parsed.output.revision === ref.revision &&
      (await digest(parsed.output)) === ref.stateDigest,
    'INTEGRITY_CHECK_FAILED',
  );
  const state = parsed.output;
  const review = await readRecoveryReview(store, state.reviewDigest);
  const backup = v.safeParse(
    backupSchema,
    store['buo:v2:backup:' + state.backupDigest],
  );
  const stage = v.safeParse(
    stageSchema,
    store['buo:v2:stage:' + state.stageDigest],
  );
  requireCondition(backup.success && stage.success, 'INTEGRITY_CHECK_FAILED');
  requireCondition(
    state.revision === review.maxRevision + 1 &&
      backup.output.digest === state.backupDigest &&
      (await digest(backup.output.sources)) === state.backupDigest &&
      (await digest(stage.output)) === state.stageDigest &&
      stage.output.backupDigest === state.backupDigest &&
      stage.output.baseHead === null &&
      (await digest(backup.output.sources)) ===
        (await digest({
          localStorage: {},
          storageLocal: {
            recovery: {
              reviewDigest: state.reviewDigest,
              operationId: state.operationId,
            },
          },
          storageSync: {},
        })),
    'INTEGRITY_CHECK_FAILED',
  );
  return { state, data: stage.output.data, review };
}

// Only the selected origin retires damaged old roots. Protection is deliberately
// separate from normal checkpoint acknowledgement and operation deduplication.
export async function recoveryProtection(store: Store) {
  const head = v.safeParse(headSchema, store[headKey]);
  if (!head.success) return new Set<string>();
  const raw = store['buo:v2:state:' + head.output.stateDigest];
  const root = v.safeParse(
    v.union([checkpointSchema, recoveryStateSchema]),
    raw,
  );
  if (!root.success || (await digest(root.output)) !== head.output.stateDigest)
    return new Set<string>();
  const rawBackup = store['buo:v2:backup:' + root.output.backupDigest];
  // Ordinary migration backups can be large. They have no recovery marker and
  // need no second whole-body verification solely for recovery protection.
  if (
    !plainObject(rawBackup) ||
    !plainObject(rawBackup.sources) ||
    !plainObject(rawBackup.sources.storageLocal)
  )
    return new Set<string>();
  const marker = v.safeParse(
    v.strictObject({
      reviewDigest: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
      operationId: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
    }),
    rawBackup.sources.storageLocal.recovery,
  );
  if (!marker.success) return new Set<string>();
  const backup = v.safeParse(backupSchema, rawBackup);
  if (
    !backup.success ||
    (await digest(backup.output.sources)) !== root.output.backupDigest
  )
    return new Set<string>();
  const review = await readRecoveryReview(store, marker.output.reviewDigest);
  return new Set(review.protectedKeys);
}
