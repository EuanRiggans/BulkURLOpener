import { useEffect, useState } from 'preact/hooks';
import { recoveryAvailabilitySchema } from '../../domain/storage/recovery';
import { recoveryCopiesSchema } from '../../domain/storage/checkpoints';
import {
  transferReviewSchema,
  type TransferReview as Review,
} from '../../domain/workspace-schema';
import { statusSchema, type Decisions } from '../../domain/storage/schema';
import type { PackedJson } from '../../domain/storage/archive';
import {
  captureDocument,
  migrationRequest,
} from '../../infrastructure/browser/migration-client';
import { serviceError } from '../services/errors';
import { TransferReview } from '../services/TransferReview';
import { ArchiveFileInput } from './ArchiveFileInput';

export function CorruptedLibraryRecovery({
  restored,
}: {
  restored: () => Promise<void>;
}) {
  const [available, setAvailable] = useState(false);
  const [copies, setCopies] = useState<
    { id: string; revision: number; lists: number }[]
  >([]);
  const [archive, setArchive] = useState<PackedJson | null>(null);
  const [imported, setImported] = useState<PackedJson | null>(null);
  const [copy, setCopy] = useState('');
  const [source, setSource] = useState<'copy' | 'file'>('copy');
  const [ack, setAck] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(serviceError(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void perform(async () => {
      const result = await migrationRequest(
        { type: 'buo:migration/recovery-available' },
        recoveryAvailabilitySchema,
      );
      setAvailable(result.available);
      if (result.available)
        setCopies(
          await migrationRequest(
            { type: 'buo:migration/recovery-copies' },
            recoveryCopiesSchema,
          ),
        );
    });
  }, []);
  async function apply(operation: string, decisions: Decisions) {
    if (!review) return;
    await migrationRequest(
      {
        type: 'buo:migration/recovery-activate',
        document: captureDocument(),
        input: {
          id: review.id,
          operation,
          decisions,
          acknowledgeReplacement: true,
        },
      },
      statusSchema,
    );
    setReview(null);
    setAvailable(false);
    await restored();
  }
  if (!available && !error) return null;
  return (
    <section aria-labelledby="corrupted-library-title" aria-busy={busy}>
      <h2 id="corrupted-library-title">Restore an unreadable library</h2>
      {error && <p role="alert">{error}</p>}
      {available && (
        <>
          <p>
            The saved library could not be verified. Close other editors and
            pause opening jobs. Download a full recovery file below, keep it
            privately, then select it here before choosing what to restore.
          </p>
          <p>
            Restoration keeps damaged library records, working drafts and
            existing opening jobs. It restores lists and settings without
            opening imported URLs or replaying imported jobs. Unreadable older
            input stays in the full archive.
          </p>
          <p role="status">{busy ? 'Working…' : ''}</p>
          {review ? (
            <TransferReview
              key={review.id}
              review={review}
              recovery
              busy={busy}
              apply={(operation, decisions) =>
                void perform(() => apply(operation, decisions))
              }
              cancel={() => {
                setReview(null);
                setArchive(null);
                setAck(false);
              }}
            />
          ) : (
            <>
              <ArchiveFileInput
                id="corruption-backup-archive"
                disabled={busy}
                ready={(value) => {
                  setArchive(value);
                  setAck(false);
                }}
                failed={(reason) => setError(serviceError(reason))}
              />
              <label class="check-label">
                <input
                  type="checkbox"
                  checked={ack}
                  disabled={busy || !archive}
                  onChange={(event) => setAck(event.currentTarget.checked)}
                />
                I will keep this full recovery archive, including the damaged
                records.
              </label>
              <label for="corruption-source">Restore from</label>
              <select
                id="corruption-source"
                value={source}
                disabled={busy}
                onChange={(event) =>
                  setSource(event.currentTarget.value as 'copy' | 'file')
                }
              >
                <option value="copy">A verified copy in this profile</option>
                <option value="file">An export or recovery file</option>
              </select>
              {source === 'copy' ? (
                <>
                  <label for="corruption-copy">Choose a verified copy</label>
                  <select
                    id="corruption-copy"
                    value={copy}
                    disabled={busy}
                    onChange={(event) => setCopy(event.currentTarget.value)}
                  >
                    <option value="">Choose a copy…</option>
                    {copies.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        Revision {entry.revision} · {entry.lists} saved lists
                      </option>
                    ))}
                  </select>
                  {!copies.length && (
                    <p>
                      No healthy internal copy was found. Choose an export or
                      recovery file instead.
                    </p>
                  )}
                </>
              ) : (
                <ArchiveFileInput
                  id="corruption-source-file"
                  label="Choose the export or recovery file to restore"
                  disabled={busy}
                  ready={setImported}
                  failed={(reason) => setError(serviceError(reason))}
                />
              )}
              <button
                disabled={
                  busy ||
                  !archive ||
                  !ack ||
                  (source === 'copy' ? !copy : !imported)
                }
                onClick={() =>
                  void perform(async () => {
                    if (!archive) return;
                    setReview(
                      await migrationRequest(
                        {
                          type: 'buo:migration/recovery-preview',
                          document: captureDocument(),
                          archive,
                          source:
                            source === 'copy'
                              ? { kind: 'copy', id: copy }
                              : {
                                  kind: 'file',
                                  text: JSON.stringify(imported),
                                },
                        },
                        transferReviewSchema,
                      ),
                    );
                  })
                }
              >
                Inspect recovery replacement
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
