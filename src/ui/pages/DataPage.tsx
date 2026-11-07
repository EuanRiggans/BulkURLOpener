import { InterruptedSaveRecovery } from '../recovery/InterruptedSaveRecovery';
import { useEffect, useState } from 'preact/hooks';
import * as v from 'valibot';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import {
  maxArchiveBytes,
  prepareImportText,
} from '../../domain/storage/archive';
import { StorageMaintenancePanel } from '../recovery/StorageMaintenancePanel';
import {
  archiveSummarySchema,
  contextSchema,
  draftResultSchema,
  recoveredInputSchema,
  transferReviewSchema,
  type TransferReview as Review,
} from '../../domain/workspace-schema';
import { statusSchema, type Decisions } from '../../domain/storage/schema';
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

type Archive = v.InferOutput<typeof archiveSummarySchema>;
type Recovered = v.InferOutput<typeof recoveredInputSchema>;
export function DataPage() {
  const [text, setText] = useState('');
  const [exported, setExported] = useState('');
  const [legacyExport, setLegacyExport] = useState(false);
  const [legacySync, setLegacySync] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [recovered, setRecovered] = useState<Recovered[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [privateMode, setPrivateMode] = useState<boolean | null>(null);
  useEffect(() => {
    void extensionRequest({ type: 'buo:service/context.read' }, contextSchema)
      .then((context) => setPrivateMode(context.private))
      .catch(() => setPrivateMode(true));
  }, []);
  async function reload() {
    const [archives, recovered] = await Promise.all([
      extensionRequest(
        { type: 'buo:service/archives.list' },
        v.array(archiveSummarySchema),
      ),
      extensionRequest(
        { type: 'buo:service/data.recovered' },
        v.array(recoveredInputSchema),
      ),
    ]);
    setArchives(archives);
    setRecovered(recovered);
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
      {
        type: 'buo:service/data.preview',
        text: await prepareImportText(text),
        source,
      },
      transferReviewSchema,
    );
    setReview(result);
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
    <PageLayout title="Data & recovery" busy={busy}>
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
          other records in recovery or legacy files stay in their protected
          originals. Plain lists/settings imports follow checkpoint retention.
          Keep the external file too. Existing drafts and jobs are kept, and
          imported jobs are never replayed.
        </p>
        <p class="hint">
          Recovery archives support up to 64 MiB of decoded JSON and 16 MiB of
          compressed data. Imports are validated before replacement; keep a
          separate lists-and-settings export too.
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
        <label for="import-file">Or choose a JSON file (up to 64 MiB)</label>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void perform(async () => {
              if (file.size > maxArchiveBytes)
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
      <section aria-labelledby="legacy-sync-title">
        <h2 id="legacy-sync-title">Recover a previous browser-sync copy</h2>
        <p>
          Browser-account sync has been removed. You can inspect an existing
          copy and recover its lists and settings locally. No data is uploaded
          or cleared.
        </p>
        <label class="check-label">
          <input
            type="checkbox"
            checked={legacySync}
            disabled={busy || privateMode !== false}
            onChange={(event) => setLegacySync(event.currentTarget.checked)}
          />
          Read the legacy copy instead of a newer preview copy
        </label>
        <button
          disabled={busy || privateMode !== false}
          onClick={() =>
            void perform(async () => {
              setReview(
                await extensionRequest(
                  { type: 'buo:service/data.recover-sync', legacy: legacySync },
                  transferReviewSchema,
                ),
              );
            })
          }
        >
          Inspect previous sync copy
        </button>
        {privateMode && (
          <p>Account-copy recovery is available only in a regular window.</p>
        )}
      </section>
      {archives.length > 0 && (
        <section aria-labelledby="archives-title">
          <h2 id="archives-title">Retained archives from earlier versions</h2>
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
                          { type: 'buo:service/archives.preview', id: item.id },
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
        </section>
      )}
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
      <InterruptedSaveRecovery />
      <StorageMaintenancePanel />
      <RecoveryPanel />
    </PageLayout>
  );
}
