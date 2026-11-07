import { useEffect, useState } from 'preact/hooks';
import * as v from 'valibot';
import {
  packedJsonSchema,
  maxArchiveBytes,
  prepareImportText,
} from '../../domain/storage/archive';
import {
  recoveryCopiesSchema,
  storageInfoSchema,
} from '../../domain/storage/checkpoints';
import { contextSchema } from '../../domain/workspace-schema';
import {
  captureDocument,
  migrationRequest,
} from '../../infrastructure/browser/migration-client';
import { extensionRequest } from '../../infrastructure/browser/client';
import { downloadText } from '../services/workspace';
import { serviceError } from '../services/errors';

export function StorageMaintenancePanel() {
  const [info, setInfo] = useState<v.InferOutput<
    typeof storageInfoSchema
  > | null>(null);
  const [copies, setCopies] = useState<
    v.InferOutput<typeof recoveryCopiesSchema>
  >([]);
  const [archive, setArchive] = useState<v.InferOutput<
    typeof packedJsonSchema
  > | null>(null);
  const [privateMode, setPrivate] = useState(true);
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function reload() {
    const [info, copies] = await Promise.all([
      migrationRequest(
        { type: 'buo:migration/storage-info' },
        storageInfoSchema,
      ),
      migrationRequest(
        { type: 'buo:migration/recovery-copies' },
        recoveryCopiesSchema,
      ),
    ]);
    setInfo(info);
    setCopies(copies);
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
    void perform(async () => {
      setPrivate(
        (
          await extensionRequest(
            { type: 'buo:service/context.read' },
            contextSchema,
          )
        ).private,
      );
      await reload();
    });
  }, []);
  return (
    <section aria-labelledby="storage-title" aria-busy={busy}>
      <h2 id="storage-title">Storage and save recovery</h2>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Working…' : notice}</p>
      {info && (
        <p>
          Estimated serialized storage:{' '}
          {(info.estimatedBytes / 1024 / 1024).toFixed(2)} MiB. Save format:{' '}
          {info.format}. Internal recovery points: {info.recoveryPoints}.
        </p>
      )}
      <p>
        Automatic snapshots have been removed. Saves reuse unchanged records and
        keep one preceding verified save for internal recovery. Original
        migration sources, damaged records, unresolved inputs and pending jobs
        stay protected.
      </p>
      {info?.cleanupPending && (
        <p>
          Some archived or obsolete records are still protected or waiting for
          cleanup. They will be checked again after a save or when you retry
          archive maintenance.
        </p>
      )}
      <button disabled={busy} onClick={() => void perform(reload)}>
        Refresh storage usage
      </button>
      <details>
        <summary>Inspect save recovery</summary>
        <p>
          These copies can include a staged save whose acknowledgement was
          interrupted. Review a downloaded library before importing it. Saved
          jobs are never opened by this action.
        </p>
        <ul>
          {copies.map((copy) => (
            <li key={copy.id}>
              Revision {copy.revision} · {copy.lists} lists{' '}
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const text = await migrationRequest(
                      { type: 'buo:migration/export-copy', digest: copy.id },
                      v.string(),
                    );
                    downloadText(
                      text,
                      'bulk-url-opener-recovered-library.json',
                    );
                    setNotice(
                      'Verified library prepared for download. Review before importing it.',
                    );
                  })
                }
              >
                Download recovered library
              </button>
            </li>
          ))}
        </ul>
      </details>
      {!privateMode && (
        <details>
          <summary>Archive earlier preview history</summary>
          <p>
            Close other editors and import reviews, and pause opening jobs.
            Download a full recovery archive using Data protection and recovery
            below, keep it somewhere private, then select that downloaded file
            here. A matching, verified archive is required before any earlier
            preview history is removed.
          </p>
          {info && (
            <p>
              {info.archiveableRecords} records (
              {(info.archiveableBytes / 1024 / 1024).toFixed(2)} MiB) may be
              archived. Records still needed by a save are kept until it is safe
              to remove them.
            </p>
          )}
          <label for="verified-archive-file">
            Select the downloaded full recovery archive
          </label>
          <input
            id="verified-archive-file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setArchive(null);
              setAcknowledge(false);
              if (file)
                void perform(async () => {
                  if (file.size > maxArchiveBytes)
                    throw new Error('RECOVERY_ARCHIVE_TOO_LARGE');
                  const text = new TextDecoder('utf-8', { fatal: true }).decode(
                    await file.arrayBuffer(),
                  );
                  setArchive(
                    v.parse(
                      packedJsonSchema,
                      JSON.parse(await prepareImportText(text)),
                    ),
                  );
                  setNotice(
                    'Archive decoded and checked. Confirm to verify it against the current profile.',
                  );
                });
              event.currentTarget.value = '';
            }}
          />
          <label class="check-label">
            <input
              type="checkbox"
              checked={acknowledge}
              disabled={busy || !archive}
              onChange={(event) => setAcknowledge(event.currentTarget.checked)}
            />
            I will keep this verified archive. Remove eligible earlier preview
            history only after the new save format is verified.
          </label>
          <button
            disabled={busy || !archive || !acknowledge}
            onClick={() =>
              void perform(async () => {
                if (!archive) return;
                const value = await migrationRequest(
                  {
                    type: 'buo:migration/compact',
                    document: captureDocument(),
                    archive,
                    acknowledge: true,
                  },
                  storageInfoSchema,
                );
                setInfo(value);
                setArchive(null);
                setAcknowledge(false);
                await reload();
                setNotice(
                  value.cleanupPending
                    ? 'Archive verified. Some records are still needed by recovery points or await cleanup. Keep the downloaded archive; later saves can finish maintenance.'
                    : 'Archive verified and preview-history maintenance completed. Keep the downloaded archive; protected records remain in the profile.',
                );
              })
            }
          >
            Verify archive and compact preview history
          </button>
        </details>
      )}
    </section>
  );
}
