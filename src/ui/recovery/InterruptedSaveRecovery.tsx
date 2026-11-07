import { useEffect, useState } from 'preact/hooks';
import type * as v from 'valibot';
import { statusSchema, type Head } from '../../domain/storage/schema';
import { pendingChangesSchema } from '../../domain/storage/quarantine';
import type { PackedJson } from '../../domain/storage/archive';
import {
  captureDocument,
  migrationRequest,
} from '../../infrastructure/browser/migration-client';
import { ArchiveFileInput } from './ArchiveFileInput';
import { serviceError } from '../services/errors';
export function InterruptedSaveRecovery() {
  const [pending, setPending] = useState<
    v.InferOutput<typeof pendingChangesSchema>
  >([]);
  const [head, setHead] = useState<Head | null>(null);
  const [archive, setArchive] = useState<PackedJson | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function reload() {
    const state = await migrationRequest(
      { type: 'buo:migration/status' },
      statusSchema,
    );
    if (!state.data || !state.head) {
      setHead(null);
      setPending([]);
      return;
    }
    const changes = await migrationRequest(
      { type: 'buo:migration/pending' },
      pendingChangesSchema,
    );
    setHead(state.head);
    setPending(changes);
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
  if (!pending.length && !error && !notice) return null;
  return (
    <section aria-labelledby="interrupted-save-title" aria-busy={busy}>
      <h2 id="interrupted-save-title">Recover interrupted editing</h2>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Working…' : notice}</p>
      {!!pending.length && (
        <>
          <p>
            A save was interrupted. If the original editor is unavailable, you
            can set the change aside and continue using your last saved lists.
            Its stored records stay protected in this profile.
          </p>
          <p>
            Close other editors, pause opening jobs and download a full recovery
            archive below. Keep that file privately, then select it here. The
            archive must match this profile before a change can be set aside.
          </p>
          <ArchiveFileInput
            id="interrupted-save-archive"
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
            I will keep the verified archive. Set aside the selected change so I
            can continue editing my last saved library.
          </label>
          {pending.map((change) => (
            <details key={change.stateDigest}>
              <summary>
                Interrupted change {change.stateDigest.slice(0, 8)}
              </summary>
              <pre>
                {change.input
                  ? JSON.stringify(change.input.command, null, 2)
                  : 'Some input records are missing or damaged. The last saved library is intact.'}
              </pre>
              <button
                disabled={busy || !archive || !ack || !head}
                onClick={() =>
                  void perform(async () => {
                    if (!archive || !head) return;
                    await migrationRequest(
                      {
                        type: 'buo:migration/quarantine',
                        document: captureDocument(),
                        archive,
                        stateDigest: change.stateDigest,
                        expectedHead: head,
                        acknowledge: true,
                      },
                      statusSchema,
                    );
                    setArchive(null);
                    setAck(false);
                    await reload();
                    setNotice(
                      'The interrupted change was set aside. Your last saved library is available for editing, and the interrupted records remain protected.',
                    );
                  })
                }
              >
                Set aside this interrupted save
              </button>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
