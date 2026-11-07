import * as v from 'valibot';
import { hashSchema } from '../storage/schema';
export const completedJobLimit = 10;
export const completedJobBytes = 1024 * 1024;
export const initialOpeningEpoch = '0'.repeat(64);
export const openingEpochSchema = v.strictObject({
  schemaVersion: v.literal(1),
  token: hashSchema,
});
export const jobGcSchema = v.strictObject({
  schemaVersion: v.literal(1),
  kind: v.picklist(['progress', 'retire']),
  jobs: v.array(hashSchema),
  records: v.array(
    v.strictObject({
      key: v.pipe(
        v.string(),
        v.regex(
          /^buo:v2:(?:job|job-plan|job-state):[a-f0-9]{64}$|^buo:v2:job-result:[a-f0-9]{64}:(?:0|[1-9]\d*)$/,
        ),
      ),
      digest: hashSchema,
    }),
  ),
  archiveDigest: v.nullable(hashSchema),
});

export type HeldJobs = {
  jobs: string[];
  unsettledTabs: number[];
  sessionId?: string;
};
