import { useEffect, useState } from 'preact/hooks';
import * as v from 'valibot';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import {
  archiveSummarySchema,
  draftResultSchema,
  recoveredInputSchema,
  snapshotListSchema,
  syncUploadReviewSchema,
  transferReviewSchema,
  type TransferReview as Review,
} from '../../domain/workspace-schema';
import {
  hashSchema,
  statusSchema,
  type Decisions,
} from '../../domain/storage/schema';
import { newRequestId } from '../../shared/ids';
import { PageLayout } from '../../ui/PageLayout';
import { RecoveryPanel } from '../../ui/recovery/RecoveryPanel';
import { TransferReview } from '../../ui/services/TransferReview';
import {
  copyText,
  downloadText,
  openPage,
  readWorkspace,
} from '../../ui/services/workspace';
import { serviceError } from '../../ui/services/errors';

type Snapshots = v.InferOutput<typeof snapshotListSchema>;
type Archive = v.InferOutput<typeof archiveSummarySchema>;
type Recovered = v.InferOutput<typeof recoveredInputSchema>;
type Upload = v.InferOutput<typeof syncUploadReviewSchema>;
export function DataPage() {
  const [text, setText] = useState('');
  const [exported, setExported] = useState('');
  const [legacyExport, setLegacyExport] = useState(false);
  const [legacySync, setLegacySync] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploadAck, setUploadAck] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshots>({
    records: [],
    damaged: 0,
  });
  const [archives, setArchives] = useState<Archive[]>([]);
  const [recovered, setRecovered] = useState<Recovered[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (review) setUpload(null);
  }, [review]);
  async function reload() {
    const results = await Promise.all([
      extensionRequest(
        { type: 'buo:service/snapshots.list' },
        snapshotListSchema,
      ),
      extensionRequest(
        { type: 'buo:service/archives.list' },
        v.array(archiveSummarySchema),
      ),
      extensionRequest(
        { type: 'buo:service/data.recovered' },
        v.array(recoveredInputSchema),
      ),
    ]);
    setSnapshots(results[0]);
    setArchives(results[1]);
    setRecovered(results[2]);
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      setError(serviceError(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void perform(reload);
  }, []);
  async function preview(text: string, source: 'paste' | 'file') {
    const result = await extensionRequest(
      { type: 'buo:service/data.preview', text, source },
      transferReviewSchema,
    );
    setReview(result);
    setUpload(null);
  }
  async function apply(operation: string, decisions: Decisions) {
    if (!review) return;
    await extensionRequest(
      {
        type: 'buo:service/data.apply',
        input: {
          id: review.id,
          operation,
          acknowledgeReplacement: true,
          decisions,
        },
      },
      statusSchema,
    );
    setReview(null);
    setNotice('Reviewed lists and settings restored. No URLs were opened.');
    await reload();
  }
  return (
    <PageLayout title="Data & recovery">
      <p>
        These pages contain your saved destinations. Share exports only with
        people you intend to give them to.
      </p>
      {error && (
        <p role="alert" class="error-message">
          {error}
        </p>
      )}
      <p role="status">{busy ? 'Working…' : notice}</p>
      {review && (
        <TransferReview
          key={review.id}
          review={review}
          busy={busy}
          apply={(operation, decisions) =>
            void perform(() => apply(operation, decisions))
          }
          cancel={() => setReview(null)}
        />
      )}
      <section aria-labelledby="export-title">
        <h2 id="export-title">Export lists and settings</h2>
        <p>
          Portable exports contain saved lists and all preferences. Drafts,
          opening jobs and recovery history are excluded. Use a full recovery
          file below to retain those records.
        </p>
        <label class="check-label">
          <input
            type="checkbox"
            checked={legacyExport}
            disabled={busy}
            onChange={(event) => {
              setLegacyExport(event.currentTarget.checked);
              setExported('');
            }}
          />
          Use the legacy 1.x JSON format
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              setExported(
                await extensionRequest(
                  { type: 'buo:service/data.export', legacy: legacyExport },
                  v.string(),
                ),
              );
              setNotice('Export prepared. Copy it or download the file.');
            })
          }
        >
          Prepare export
        </button>
        {exported && (
          <>
            <label for="export-json">Export JSON</label>
            <textarea
              id="export-json"
              value={exported}
              readOnly
              rows={8}
              spellcheck={false}
            />
            <div class="actions">
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await copyText(exported);
                    setNotice('Export copied.');
                  })
                }
              >
                Copy JSON
              </button>
              <button
                onClick={() =>
                  downloadText(exported, 'bulk-url-opener-lists.json')
                }
              >
                Download JSON
              </button>
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="import-title">
        <h2 id="import-title">Import or restore</h2>
        <p>
          Supports 1.x exports, modern portable exports and verified full
          recovery files. Inspect the proposed lists and settings before
          accepting a replacement. Recovery imports restore lists and settings;
          other imported records stay in the retained original. Existing drafts
          and jobs are kept, and imported jobs are never replayed.
        </p>
        <label for="import-json">Paste JSON</label>
        <textarea
          id="import-json"
          value={text}
          rows={6}
          spellcheck={false}
          disabled={busy}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <div class="actions">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void perform(() => preview(text, 'paste'))}
          >
            Inspect pasted JSON
          </button>
        </div>
        <label for="import-file">Or choose a JSON file (up to 8 MiB)</label>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void perform(async () => {
              if (file.size > 8 * 1024 * 1024)
                throw new Error('IMPORT_TOO_LARGE');
              let content: string;
              try {
                content = new TextDecoder('utf-8', { fatal: true }).decode(
                  await file.arrayBuffer(),
                );
              } catch {
                throw new Error('IMPORT_INVALID');
              }
              await preview(content, 'file');
            });
            event.currentTarget.value = '';
          }}
        />
      </section>
      <section aria-labelledby="sync-title">
        <h2 id="sync-title">Manual browser-account sync</h2>
        <p>
          Upload and download are explicit. Enable extension sync in your
          browser account. Chrome-family and Firefox accounts do not share data;
          use a JSON file between them. Sync copies contain saved URLs and
          preferences.
        </p>
        <p class="hint">
          A modern sync copy is limited to 8 KB. Larger libraries use JSON
          transfer. An API read-back confirms the local sync area; remote
          delivery still depends on the browser.
        </p>
        <label class="check-label">
          <input
            type="checkbox"
            checked={legacySync}
            disabled={busy}
            onChange={(event) => setLegacySync(event.currentTarget.checked)}
          />
          Read the legacy sync copy even if a modern copy exists
        </label>
        <div class="actions">
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                setReview(
                  await extensionRequest(
                    { type: 'buo:service/sync.download', legacy: legacySync },
                    transferReviewSchema,
                  ),
                );
                setUpload(null);
              })
            }
          >
            Inspect sync download
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                setUpload(
                  await extensionRequest(
                    { type: 'buo:service/sync.preview-upload' },
                    syncUploadReviewSchema,
                  ),
                );
                setUploadAck(false);
                setReview(null);
              })
            }
          >
            Review upload
          </button>
        </div>
        {upload && (
          <div class="transfer-review">
            <h3>Review sync upload</h3>
            <p>
              {upload.lists} lists · {upload.bytes} bytes ·{' '}
              {upload.replacesCopy
                ? 'replaces the modern sync copy'
                : 'creates a modern sync copy'}
              . The previous sync contents are retained locally. The original
              legacy sync key is kept.
            </p>
            <details>
              <summary>Exact data to upload</summary>
              <pre>{JSON.stringify(upload.data, null, 2)}</pre>
            </details>
            <label class="check-label">
              <input
                type="checkbox"
                checked={uploadAck}
                disabled={busy}
                onChange={(event) => setUploadAck(event.currentTarget.checked)}
              />
              Upload this reviewed data to my browser account.
            </label>
            <div class="actions">
              <button
                disabled={busy || !uploadAck}
                onClick={() =>
                  void perform(async () => {
                    await extensionRequest(
                      {
                        type: 'buo:service/sync.upload',
                        id: upload.id,
                        acknowledge: true,
                      },
                      v.boolean(),
                    );
                    setUpload(null);
                    setNotice(
                      'Sync write verified locally. Remote delivery is managed by the browser.',
                    );
                  })
                }
              >
                Upload reviewed copy
              </button>
              <button disabled={busy} onClick={() => setUpload(null)}>
                Cancel upload
              </button>
            </div>
          </div>
        )}
      </section>
      <section aria-labelledby="snapshot-title">
        <h2 id="snapshot-title">Snapshots</h2>
        <p>
          Up to five optional snapshots retain lists and settings from before
          changes. Disabling automatic snapshots stops new automatic copies.
          Migration backups and verified history are retained separately.
        </p>
        <div class="actions">
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await extensionRequest(
                  { type: 'buo:service/snapshots.capture' },
                  hashSchema,
                );
                await reload();
                setNotice('Snapshot verified.');
              })
            }
          >
            Take snapshot now
          </button>
          <button disabled={busy} onClick={() => void perform(reload)}>
            Refresh recovery records
          </button>
          <button
            disabled={busy || !snapshots.records.length}
            onClick={() => {
              if (
                confirm(
                  'Delete the optional snapshots listed here? Mandatory history and original legacy snapshots will be kept.',
                )
              )
                void perform(async () => {
                  await extensionRequest(
                    { type: 'buo:service/snapshots.purge', acknowledge: true },
                    v.boolean(),
                  );
                  await reload();
                  setNotice('Optional snapshots deleted.');
                });
            }}
          >
            Delete optional snapshots
          </button>
        </div>
        {snapshots.damaged > 0 && (
          <p role="alert">
            {snapshots.damaged} damaged snapshot records were retained for
            recovery.
          </p>
        )}
        {snapshots.records.length ? (
          <ul>
            {snapshots.records.map((item) => (
              <li key={item.id}>
                <span>
                  {new Date(item.createdAt).toLocaleString()} · {item.lists}{' '}
                  lists
                </span>{' '}
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setReview(
                        await extensionRequest(
                          {
                            type: 'buo:service/snapshots.preview',
                            id: item.id,
                            legacy: false,
                          },
                          transferReviewSchema,
                        ),
                      );
                    })
                  }
                >
                  Review restore
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No optional snapshots yet.</p>
        )}
        {archives.length > 0 && (
          <details>
            <summary>
              Original legacy snapshots and sync archives ({archives.length})
            </summary>
            <ul>
              {archives.map((item) => (
                <li key={item.id}>
                  {item.label}{' '}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        setReview(
                          await extensionRequest(
                            {
                              type: 'buo:service/snapshots.preview',
                              id: item.id,
                              legacy: true,
                            },
                            transferReviewSchema,
                          ),
                        );
                      })
                    }
                  >
                    Inspect archive
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {recovered.length > 0 && (
        <section aria-labelledby="recovered-title">
          <h2 id="recovered-title">Recovered inputs</h2>
          <p>These entries are retained without being opened automatically.</p>
          {recovered.map((item) => (
            <details key={item.id}>
              <summary>
                {item.label} · {item.lines.length} lines
              </summary>
              <pre>{item.lines.join('\n')}</pre>
              <div class="actions">
                <button
                  onClick={() =>
                    downloadText(
                      item.lines.join('\n'),
                      'bulk-url-opener-recovered.txt',
                      'text/plain',
                    )
                  }
                >
                  Download text
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        'Use these entries as the working draft? Existing saved lists will be kept.',
                      )
                    )
                      return;
                    void perform(async () => {
                      const state = await readWorkspace();
                      const result = await extensionRequest(
                        {
                          type: 'buo:service/draft.freeze',
                          input: {
                            client: newRequestId(),
                            sequence: 1,
                            base: state.draft.head,
                            lines: item.lines,
                          },
                        },
                        draftResultSchema,
                      );
                      if (!result.saved) throw new Error('REVISION_CONFLICT');
                      await openPage(
                        pageUrl('/popup.html', { draft: result.submitted }),
                      );
                    });
                  }}
                >
                  Use in opener
                </button>
              </div>
            </details>
          ))}
        </section>
      )}
      {snapshots.records.length > 5 && (
        <p role="status">
          Extra verified snapshots were kept because cleanup did not complete. A
          new capture will retry cleanup; original recovery history is kept.
        </p>
      )}
      <RecoveryPanel />
    </PageLayout>
  );
}
