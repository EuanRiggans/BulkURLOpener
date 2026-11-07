import * as v from 'valibot';
import { epochKey } from './job-maintenance';
import { inspectTransfer, selectTransfer } from '../transfer-inspection';
import { CheckpointReader, contentKey, stateKey } from './checkpoints';
import {
  isRecoveryState,
  readRecoveryReview,
  recoveryReviewKey,
} from './recovery-records';
import {
  recoveryReviewRecordSchema,
  recoveryApplySchema,
  recoveryStateSchema,
  recoveryPlaceholderHead,
  type RecoverySource,
  type RecoveryApply,
} from '../../domain/storage/recovery';
import {
  checkpointSchema,
  metadataSchema,
} from '../../domain/storage/checkpoints';
import {
  backupSchema,
  stageSchema,
  headKey,
  headSchema,
  recoveryExportSchema,
  type StorageStatus,
  type Sources,
  type CanonicalData,
  type Head,
} from '../../domain/storage/schema';
import {
  packJson,
  unpackJson,
  maxTransportBytes,
  type PackedJson,
} from '../../domain/storage/archive';
import { digest, type JsonValue } from '../../domain/storage/json';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { sameContent } from '../../domain/storage/migrate';
import { toPortable } from '../../domain/portable';
import type { TransferReview } from '../../domain/workspace-schema';

type Store = Record<string, unknown>;
export interface RecoveryIO {
  read(): Promise<Store>;
  capture(document: Record<string, string>): Promise<Sources>;
  append(key: string, value: unknown): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
  verify(store: Store): Promise<StorageStatus>;
  readRecovery(store: Store): Promise<CanonicalData | null>;
  known(store: Store): void;
  now(): string;
}
export class CorruptionRecovery {
  constructor(private readonly io: RecoveryIO) {}
  private async damaged(store: Store) {
    this.io.known(store);
    for (const [key, raw] of Object.entries(store))
      if (
        key.startsWith('buo:v2:state:') &&
        raw &&
        typeof raw === 'object' &&
        'schemaVersion' in raw
      )
        requireCondition(
          typeof raw.schemaVersion !== 'number' || raw.schemaVersion <= 5,
          'UNKNOWN_STORAGE_VERSION',
        );
    if (!Object.hasOwn(store, headKey)) {
      requireCondition(
        Object.keys(store).some((key) => key.startsWith('buo:v2:state:')),
        'RECOVERY_NOT_REQUIRED',
      );
      return;
    }
    try {
      await this.io.verify(store);
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        ['INTEGRITY_CHECK_FAILED', 'RECOVERY_REVIEW_INVALID'].includes(
          reason.code,
        )
      )
        return;
      throw reason;
    }
    throw new MigrationError('RECOVERY_NOT_REQUIRED');
  }
  async available() {
    try {
      await this.damaged(await this.io.read());
      return { available: true };
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        reason.code === 'RECOVERY_NOT_REQUIRED'
      )
        return { available: false };
      throw reason;
    }
  }
  private revision(store: Store) {
    let maximum = 1;
    for (const [key, raw] of Object.entries(store)) {
      if (key !== headKey && !key.startsWith('buo:v2:state:')) continue;
      if (
        raw &&
        typeof raw === 'object' &&
        'revision' in raw &&
        Number.isSafeInteger(raw.revision) &&
        Number(raw.revision) >= 1
      )
        maximum = Math.max(maximum, Number(raw.revision));
    }
    requireCondition(
      maximum < Number.MAX_SAFE_INTEGER,
      'RECOVERY_REVISION_EXHAUSTED',
    );
    return maximum;
  }
  private async metadata(store: Store) {
    const head = v.safeParse(headSchema, store[headKey]);
    if (head.success) {
      const root = v.safeParse(
        checkpointSchema,
        store[stateKey(head.output.stateDigest)],
      );
      if (
        root.success &&
        (await digest(root.output)) === head.output.stateDigest
      ) {
        const raw = store[contentKey('metadata', root.output.metadata)];
        const parsed = v.safeParse(metadataSchema, raw);
        if (
          parsed.success &&
          (await digest(parsed.output)) === root.output.metadata
        )
          return parsed.output;
        if (root.output.base) {
          try {
            const data = await new CheckpointReader(store).anchor(
              root.output.base,
            );
            const metadata = {
              draftLines: data.draftLines,
              recoveredInputs: data.recoveredInputs,
            };
            if ((await digest(metadata)) === root.output.metadata)
              return metadata;
          } catch {
            /* Preserve unreadable originals in the protected source. */
          }
        }
      }
    }
    return { draftLines: null, recoveredInputs: [] };
  }
  async preview(
    document: Record<string, string>,
    packed: PackedJson,
    source: RecoverySource,
  ): Promise<TransferReview> {
    const store = await this.io.read();
    await this.damaged(store);
    const decoded = v.safeParse(recoveryExportSchema, await unpackJson(packed));
    requireCondition(
      decoded.success &&
        (await digest(decoded.output.sources)) === decoded.output.digest,
      'RECOVERY_DIGEST_MISMATCH',
    );
    requireCondition(
      (await digest(await this.io.capture(document))) === decoded.output.digest,
      'ARCHIVE_SOURCES_CHANGED',
    );
    let raw: JsonValue;
    if (source.kind === 'copy') {
      const root = store[stateKey(source.id)];
      requireCondition(
        root &&
          typeof root === 'object' &&
          'revision' in root &&
          typeof root.revision === 'number',
        'INTEGRITY_CHECK_FAILED',
      );
      const data = await new CheckpointReader(store).read(
        recoveryPlaceholderHead(root.revision, source.id),
      );
      raw = toPortable(data.data);
    } else {
      requireCondition(
        new TextEncoder().encode(source.text).byteLength <= maxTransportBytes,
        'IMPORT_TOO_LARGE',
      );
      try {
        raw = await unpackJson(JSON.parse(source.text) as unknown);
      } catch (reason) {
        if (reason instanceof MigrationError) throw reason;
        throw new MigrationError('IMPORT_INVALID');
      }
    }
    const inspected = await inspectTransfer(raw, (store) =>
      this.io.readRecovery(store),
    );
    const review = v.parse(recoveryReviewRecordSchema, {
      schemaVersion: 1,
      createdAt: this.io.now(),
      sourcesDigest: decoded.output.digest,
      archiveDigest: await digest(decoded.output),
      originalHead: {
        present: Object.hasOwn(store, headKey),
        value: store[headKey] ?? null,
      },
      originalEpoch: {
        present: Object.hasOwn(store, epochKey),
        value: store[epochKey] ?? null,
      },
      maxRevision: this.revision(store),
      protectedKeys: Object.keys(store).filter((key) =>
        /^buo:v2:(state|content|transfer|gc|archive-proof|quarantine|recovery-review):/.test(
          key,
        ),
      ),
      raw: await packJson(raw),
      sourceCopy: source.kind === 'copy' ? source.id : null,
      metadata: await this.metadata(store),
    });
    const id = await digest(review);
    await this.io.append(recoveryReviewKey(id), review);
    await readRecoveryReview(await this.io.read(), id);
    return {
      id,
      baseHead: recoveryPlaceholderHead(
        review.maxRevision,
        await digest(review.originalHead),
      ),
      source: source.kind === 'copy' ? 'snapshot' : 'file',
      ...inspected,
    };
  }
  async apply(
    document: Record<string, string>,
    input: RecoveryApply,
  ): Promise<StorageStatus> {
    input = v.parse(recoveryApplySchema, input);
    const store = await this.io.read();
    const review = await readRecoveryReview(store, input.id);
    const data = {
      ...selectTransfer(
        await inspectTransfer(await unpackJson(review.raw), (store) =>
          this.io.readRecovery(store),
        ),
        input.decisions,
      ),
      ...review.metadata,
    };
    if (review.sourceCopy) {
      const original = (await this.io.read())[stateKey(review.sourceCopy)];
      requireCondition(
        original &&
          typeof original === 'object' &&
          'revision' in original &&
          typeof original.revision === 'number',
        'INTEGRITY_CHECK_FAILED',
      );
      const copy = await new CheckpointReader(store).read(
        recoveryPlaceholderHead(original.revision, review.sourceCopy),
      );
      // Internal recovery keeps legacy identities/provenance too. The portable
      // preview describes the same lists without exposing migration internals.
      data.lists = copy.data.lists;
      data.settings = copy.data.settings;
    }
    const sources = {
      localStorage: {},
      storageLocal: {
        recovery: { reviewDigest: input.id, operationId: input.operation },
      },
      storageSync: {},
    };
    const backupDigest = await digest(sources);
    const backup = v.parse(backupSchema, {
      schemaVersion: 1,
      capturedAt: review.createdAt,
      digest: backupDigest,
      sources,
    });
    const stage = v.parse(stageSchema, {
      schemaVersion: 1,
      backupDigest,
      baseHead: null,
      decisions: input.decisions,
      data,
    });
    const stageDigest = await digest(stage);
    const state = v.parse(recoveryStateSchema, {
      schemaVersion: 5,
      kind: 'recovery',
      revision: review.maxRevision + 1,
      backupDigest,
      stageDigest,
      reviewDigest: input.id,
      operationId: input.operation,
    });
    const stateDigest = await digest(state);
    const head: Head = recoveryPlaceholderHead(state.revision, stateDigest);
    for (const [, raw] of Object.entries(store).filter(([key]) =>
      key.startsWith('buo:v2:state:'),
    ))
      if (isRecoveryState(raw)) {
        const previous = v.safeParse(recoveryStateSchema, raw);
        if (previous.success && previous.output.operationId === input.operation)
          requireCondition(
            sameContent(previous.output, state),
            'OPERATION_ID_REUSED',
          );
      }
    try {
      const current = await this.io.verify(store);
      if (current.head) {
        const raw = store[stateKey(current.head.stateDigest)];
        if (
          raw &&
          typeof raw === 'object' &&
          'backupDigest' in raw &&
          'stageDigest' in raw &&
          raw.backupDigest === backupDigest &&
          raw.stageDigest === stageDigest
        )
          return current; // Acknowledgement lost after publication or a later save.
      }
    } catch (reason) {
      if (
        !(reason instanceof MigrationError) ||
        !['INTEGRITY_CHECK_FAILED', 'RECOVERY_REVIEW_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
    }
    await this.damaged(store);
    requireCondition(
      Object.hasOwn(store, headKey) === review.originalHead.present &&
        sameContent(store[headKey] ?? null, review.originalHead.value),
      'REVISION_CONFLICT',
    );
    const outputs: Store = {
      [stateKey(stateDigest)]: state,
      ['buo:v2:backup:' + backupDigest]: backup,
      ['buo:v2:stage:' + stageDigest]: stage,
    };
    const captured = await this.io.capture(document);
    const baseline = { ...captured.storageLocal };
    delete baseline[recoveryReviewKey(input.id)];
    for (const [key, value] of Object.entries(outputs)) {
      if (Object.hasOwn(baseline, key))
        requireCondition(
          sameContent(baseline[key], value),
          'IMMUTABLE_RECORD_CONFLICT',
        );
      delete baseline[key];
    }
    const epoch = { schemaVersion: 1, token: stateDigest };
    if (sameContent(baseline[epochKey] ?? null, epoch)) {
      if (review.originalEpoch.present)
        baseline[epochKey] = review.originalEpoch.value;
      else delete baseline[epochKey];
    }
    requireCondition(
      (await digest({ ...captured, storageLocal: baseline })) ===
        review.sourcesDigest,
      'ARCHIVE_SOURCES_CHANGED',
    );
    // The intent precedes its bodies; the damaged active pointer is changed last.
    for (const [key, value] of Object.entries(outputs))
      await this.io.append(key, value);
    await this.io.verify({ ...(await this.io.read()), [headKey]: head });
    const beforePublish = await this.io.read();
    requireCondition(
      Object.hasOwn(beforePublish, headKey) === review.originalHead.present &&
        sameContent(beforePublish[headKey] ?? null, review.originalHead.value),
      'REVISION_CONFLICT',
    );
    // Invalidate gestures cached before recovery without importing/replaying jobs.
    await this.io.write(epochKey, epoch);
    await this.io.write(headKey, head);
    return this.io.verify(await this.io.read());
  }
}
