import * as v from 'valibot';
import { readRecoveryStore } from './coordinator';
import { digest } from '../../domain/storage/json';
import {
  analyzeSources,
  createCandidate,
  sameContent,
} from '../../domain/storage/migrate';
import {
  headKey,
  headSchema,
  recoveryExportSchema,
  sourcesSchema,
  stageSchema,
  stateSchema,
  type Sources,
} from '../../domain/storage/schema';
import { MigrationError, requireCondition } from '../../domain/storage/errors';

async function sources(raw: unknown, allowRaw: boolean): Promise<Sources> {
  const envelope = v.safeParse(recoveryExportSchema, raw);
  if (envelope.success) {
    requireCondition(
      (await digest(envelope.output.sources)) === envelope.output.digest,
      'RECOVERY_DIGEST_MISMATCH',
    );
    return envelope.output.sources;
  }
  requireCondition(allowRaw, 'RECOVERY_FILE_REQUIRED');
  const original = v.safeParse(sourcesSchema, raw);
  requireCondition(original.success, 'BASELINE_FORMAT_INVALID');
  return original.output;
}

// No writes, browser APIs or source contents in the result. Freeze the test profile
// between captures: intentional edits and progressing jobs are differences too.
export async function auditUpgrade(beforeRaw: unknown, afterRaw: unknown) {
  const before = await sources(beforeRaw, true);
  const after = await sources(afterRaw, false);
  requireCondition(
    Object.values(before).some((area) => Object.keys(area).length > 0),
    'BASELINE_EMPTY',
  );
  const retained = Object.keys(before).every((name) => {
    const area = name as keyof Sources;
    return Object.entries(before[area]).every(
      ([key, value]) =>
        Object.hasOwn(after[area], key) && sameContent(value, after[area][key]),
    );
  });
  const active = await readRecoveryStore(after.storageLocal);
  requireCondition(active, 'ACTIVE_LIBRARY_REQUIRED');
  const previous = await readRecoveryStore(before.storageLocal);
  const checks = [{ code: 'ORIGINAL_RECORDS_UNCHANGED', passed: retained }];
  if (previous) {
    checks.push({
      code: 'CANONICAL_DATA_UNCHANGED',
      passed: sameContent(previous, active),
    });
  } else {
    // Use the migration decisions actually recorded in the verified candidate.
    // Never choose one side of a conflict on the tester's behalf.
    const head = v.parse(headSchema, after.storageLocal[headKey]);
    const state = v.parse(
      stateSchema,
      after.storageLocal['buo:v2:state:' + head.stateDigest],
    );
    const stage = v.parse(
      stageSchema,
      after.storageLocal['buo:v2:stage:' + state.stageDigest],
    );
    const plan = await analyzeSources(before);
    const expected = createCandidate(plan, stage.decisions);
    checks.push({
      code: 'MIGRATION_BACKUP_MATCHES_BASELINE',
      passed: stage.backupDigest === (await digest(before)),
    });
    checks.push({
      code: 'REVIEWED_MIGRATION_DATA_UNCHANGED',
      passed: sameContent(expected, active),
    });
  }
  return {
    format: 'bulk-url-opener-upgrade-audit' as const,
    schemaVersion: 1 as const,
    passed: checks.every((check) => check.passed),
    baseline: previous ? ('canonical' as const) : ('legacy' as const),
    checks,
    counts: {
      lists: active.lists.length,
      lines: active.lists.reduce((n, list) => n + list.lines.length, 0),
      localRecordsBefore: Object.keys(before.storageLocal).length,
      localRecordsAfter: Object.keys(after.storageLocal).length,
    },
    scope:
      'Data comparison only; identity, signatures, permission prompts, remote sync and browser behavior require separate evidence.',
  };
}

export function upgradeAuditError(reason: unknown): string {
  // Schema errors may contain private input values. Never forward their text.
  return reason instanceof MigrationError
    ? reason.code
    : 'UPGRADE_AUDIT_FAILED';
}
