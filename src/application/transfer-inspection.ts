import * as v from 'valibot';
import {
  backupSchema,
  recoveryExportSchema,
  type CanonicalData,
  type Decisions,
} from '../domain/storage/schema';
import { digest, type JsonValue } from '../domain/storage/json';
import { analyzeSources, createCandidate } from '../domain/storage/migrate';
import { portableData, portableSchema, toPortable } from '../domain/portable';
import type { TransferReview } from '../domain/workspace-schema';
import { requireCondition } from '../domain/storage/errors';

export async function inspectTransfer(
  raw: JsonValue,
  readRecovery: (
    store: Record<string, unknown>,
  ) => Promise<CanonicalData | null>,
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
    const data = await readRecovery(recovery.output.sources.storageLocal);
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
export function selectTransfer(
  review: Pick<TransferReview, 'portable' | 'legacy'>,
  decisions: Decisions,
): Pick<CanonicalData, 'lists' | 'settings'> {
  if (review.portable) return portableData(review.portable);
  requireCondition(review.legacy, 'IMPORT_INVALID');
  return createCandidate(review.legacy, decisions);
}
