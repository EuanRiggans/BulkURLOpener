import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import {
  backupSchema,
  recoveryExportSchema,
  reviewSchema,
  statusSchema,
  type Decisions,
  type MigrationReview,
  type StorageStatus,
} from '../../domain/storage/schema';
import {
  captureDocument,
  migrationRequest,
} from '../../infrastructure/browser/migration-client';
import { MigrationReviewForm } from './MigrationReviewForm';
import { recoveryError } from './labels';

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function RecoveryPanel() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [review, setReview] = useState<MigrationReview | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({
    acknowledgeIssues: false,
    preferences: {},
    historical: {},
  });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (
      changes: Record<string, { oldValue?: unknown }>,
      area: string,
    ) => {
      if (
        area !== 'local' ||
        !Object.entries(changes).some(
          ([key, change]) =>
            key === 'buo:v2:head' ||
            (key.startsWith('buo:v2:job:') && change.oldValue === undefined),
        )
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void migrationRequest({ type: 'buo:migration/status' }, statusSchema)
          .then((value) => {
            if (mounted) setStatus(value);
          })
          .catch((reason: unknown) => {
            if (mounted) {
              setStatus(null);
              setError(recoveryError(reason));
            }
          });
      }, 150);
    };
    browser.storage.onChanged.addListener(changed);
    void migrationRequest({ type: 'buo:migration/status' }, statusSchema)
      .then((value) => {
        if (mounted) setStatus(value);
      })
      .catch((reason: unknown) => {
        if (mounted) setError(recoveryError(reason));
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
      clearTimeout(timer);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      setError(recoveryError(reason));
      // An acknowledgement may be lost after publication; show actual state.
      try {
        setStatus(
          await migrationRequest(
            { type: 'buo:migration/status' },
            statusSchema,
          ),
        );
      } catch {
        setStatus(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="recovery-title" aria-busy={busy}>
      <h2 id="recovery-title">Data protection and recovery</h2>
      <p>
        Close any pages from the old extension before inspecting data. Migration
        keeps original page storage, background mirrors, sync copies and
        snapshots intact.
      </p>
      <p class="hint">
        Recovery downloads contain your saved data. Keep them somewhere private.
        Nothing is sent to the developer.
      </p>
      {error && (
        <p role="alert" class="error-message">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {busy
          ? 'Working…'
          : status?.status === 'ready'
            ? 'Migration verified. ' +
              String(status.data?.lists.length ?? 0) +
              ' saved lists are protected.'
            : status?.status === 'rolled-back'
              ? 'Migration was undone. Original data and recovery records are retained.'
              : status?.status === 'uninitialized'
                ? 'Data has not been migrated.'
                : 'Data integrity is not verified. Migration is blocked.'}
        {notice && ' ' + notice}
      </p>
      <div class="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void perform(async () => {
              const file = await migrationRequest(
                { type: 'buo:migration/export', document: captureDocument() },
                recoveryExportSchema,
              );
              requireCondition(
                (await digest(file.sources)) === file.digest,
                'INTEGRITY_CHECK_FAILED',
              );
              download(file, 'bulk-url-opener-recovery');
              setNotice('Recovery download prepared.');
            });
          }}
        >
          Download recovery file
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void perform(async () => {
              setStatus(
                await migrationRequest(
                  { type: 'buo:migration/status' },
                  statusSchema,
                ),
              );
            });
          }}
        >
          Check status
        </button>
        {status && status.status !== 'ready' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                const value = await migrationRequest(
                  {
                    type: 'buo:migration/prepare',
                    document: captureDocument(),
                  },
                  reviewSchema,
                );
                setReview(value);
                setDecisions(
                  value.resumeDecisions ?? {
                    acknowledgeIssues: false,
                    preferences: {},
                    historical: {},
                  },
                );
              });
            }}
          >
            Inspect and back up data
          </button>
        )}
      </div>
      {review && status?.status !== 'ready' && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                const backup = await migrationRequest(
                  { type: 'buo:migration/backup', digest: review.backupDigest },
                  backupSchema,
                );
                requireCondition(
                  (await digest(backup.sources)) === backup.digest,
                  'INTEGRITY_CHECK_FAILED',
                );
                download(backup, 'bulk-url-opener-verified-backup');
              });
            }}
          >
            Download this verified backup
          </button>
          <MigrationReviewForm
            review={review}
            decisions={decisions}
            onDecisions={setDecisions}
            busy={busy}
            onCommit={() => {
              void perform(async () => {
                const value = await migrationRequest(
                  {
                    type: 'buo:migration/commit',
                    document: captureDocument(),
                    backupDigest: review.backupDigest,
                    baseHead: review.baseHead,
                    decisions,
                  },
                  statusSchema,
                );
                setStatus(value);
                setReview(null);
                setNotice('Opening and list editing arrive in later phases.');
              });
            }}
          />
        </>
      )}
      {status?.status === 'ready' && status.canRollback && (
        <details>
          <summary>Undo this migration</summary>
          <p>
            This returns to the previous active state with a new verified
            revision. For the first migration that means data becomes inactive
            until migrated again. It does not delete original data, backups or
            history.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                if (!status.head) return;
                setStatus(
                  await migrationRequest(
                    { type: 'buo:migration/rollback', expected: status.head },
                    statusSchema,
                  ),
                );
                setReview(null);
              });
            }}
          >
            Undo migration
          </button>
        </details>
      )}
    </section>
  );
}
