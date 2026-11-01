import * as v from 'valibot';
import {
  hashSchema,
  headSchema,
  listIdSchema,
  settingsSchema,
} from '../storage/schema';

const natural = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const timestampSchema = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);
export const targetWindowSchema = v.nullable(natural);
export const triggerSchema = v.picklist([
  'popup',
  'context-menu',
  'startup',
  'saved-list',
]);
const destinationSchema = v.strictObject({
  inputIndex: natural,
  input: v.string(),
  url: v.string(),
});
const rejectionSchema = v.strictObject({
  inputIndex: natural,
  input: v.string(),
  reason: v.picklist([
    'empty',
    'ignored-text',
    'extraction-failed',
    'blocked-scheme',
    'invalid-url',
    'duplicate',
  ]),
});
export const jobPlanSchema = v.strictObject({
  schemaVersion: v.literal(1),
  id: hashSchema,
  requestDigest: hashSchema,
  origin: headSchema,
  trigger: triggerSchema,
  sourceListId: v.nullable(listIdSchema),
  createdAt: timestampSchema,
  windowId: targetWindowSchema,
  browserSessionId: hashSchema,
  settings: settingsSchema,
  destinations: v.array(destinationSchema),
  rejected: v.array(rejectionSchema),
});
export type JobPlan = v.InferOutput<typeof jobPlanSchema>;
export const planEnvelopeSchema = v.strictObject({
  digest: hashSchema,
  plan: jobPlanSchema,
});
export const jobHeadSchema = v.strictObject({
  schemaVersion: v.literal(1),
  id: hashSchema,
  revision: v.pipe(natural, v.minValue(1)),
  stateDigest: hashSchema,
});
export const runSchema = v.strictObject({
  schemaVersion: v.literal(1),
  id: hashSchema,
  revision: v.pipe(natural, v.minValue(1)),
  previousDigest: v.nullable(hashSchema),
  planDigest: hashSchema,
  status: v.picklist([
    'queued',
    'running',
    'paused',
    'needs-review',
    'completed',
    'cancelled',
  ]),
  cursor: natural,
  nextDueAt: timestampSchema,
  windowId: targetWindowSchema,
  windowSessionId: hashSchema,
  inFlight: v.nullable(
    v.variant('kind', [
      v.strictObject({ kind: v.literal('create'), index: natural }),
      v.strictObject({ kind: v.literal('activate'), tabId: natural }),
    ]),
  ),
  error: v.nullable(
    v.picklist([
      'INTERRUPTED_CREATE',
      'INTERRUPTED_ACTIVATION',
      'TAB_CREATE_FAILED',
      'TAB_ACTIVATION_FAILED',
      'RECOVERY_ALARM_FAILED',
      'TARGET_WINDOW_CHANGED',
      'DATA_CONSENT_REQUIRED',
    ]),
  ),
  activation: v.picklist([
    'pending',
    'not-required',
    'done',
    'failed',
    'uncertain',
  ]),
  lastTabId: v.nullable(natural),
});
export type JobRun = v.InferOutput<typeof runSchema>;
export const receiptSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(1),
    jobId: hashSchema,
    index: natural,
    planDigest: hashSchema,
    kind: v.picklist(['opened', 'assumed-opened', 'skipped']),
    tabId: v.nullable(natural),
    recordedAt: timestampSchema,
  }),
  v.check((receipt) =>
    receipt.kind === 'opened' ? receipt.tabId !== null : receipt.tabId === null,
  ),
);
export type TabReceipt = v.InferOutput<typeof receiptSchema>;
export const receiptEnvelopeSchema = v.strictObject({
  digest: hashSchema,
  receipt: receiptSchema,
});
export const jobViewSchema = v.strictObject({
  plan: jobPlanSchema,
  run: runSchema,
  receipts: v.array(v.nullable(receiptSchema)),
});
export type JobView = v.InferOutput<typeof jobViewSchema>;
export const controlSchema = v.variant('action', [
  v.strictObject({ action: v.picklist(['pause', 'cancel']) }),
  v.strictObject({
    action: v.literal('resume'),
    windowId: v.optional(targetWindowSchema),
  }),
  v.strictObject({
    action: v.literal('retry'),
    windowId: v.optional(targetWindowSchema),
  }),
  v.strictObject({
    action: v.picklist(['assume-opened', 'skip', 'retry-activation', 'finish']),
  }),
]);
export type JobControl = v.InferOutput<typeof controlSchema>;
