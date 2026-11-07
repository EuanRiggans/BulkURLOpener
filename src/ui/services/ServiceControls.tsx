import { pendingChangesSchema } from '../../domain/storage/quarantine';
import { useEffect, useState } from 'preact/hooks';
import { observeWorkspace } from '../../infrastructure/browser/change-events';
import * as v from 'valibot';
import {
  dataSchema,
  headSchema,
  statusSchema,
} from '../../domain/storage/schema';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { serviceError } from './errors';
import { scopedKeys } from '../../shared/storage-events';

const activeSchema = v.strictObject({ head: headSchema, data: dataSchema });
const pendingSchema = pendingChangesSchema;
type Active = v.InferOutput<typeof activeSchema>;
type Pending = v.InferOutput<typeof pendingSchema>;

export function ServiceControls() {
  const [active, setActive] = useState<Active | null>(null);
  const [pending, setPending] = useState<Pending>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const state = await extensionRequest(
          { type: 'buo:service/library.read' },
          activeSchema,
        );
        const changes = await extensionRequest(
          { type: 'buo:service/library.pending' },
          pendingSchema,
        );
        if (mounted) {
          setActive(state);
          setPending(changes);
        }
      } catch (reason) {
        if (mounted) {
          setActive(null);
          if (!(
            reason instanceof Error && reason.message === 'MIGRATION_REQUIRED'
          ))
            setError(serviceError(reason));
        }
      }
    }
    function changed(changes: Record<string, unknown>, area: string) {
      if (
        !scopedKeys(changes, area).some(
          (key) => key === 'buo:v2:head' || key.startsWith('buo:v2:state:'),
        )
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void read();
      }, 150);
    }
    const stopObserving = observeWorkspace(changed);
    void read();
    return () => {
      mounted = false;
      clearTimeout(timer);
      stopObserving();
    };
  }, []);
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
  return (
    <section aria-labelledby="services-title">
      <h2 id="services-title">Saved-change recovery</h2>
      <p>
        <a href={pageUrl('/opening.html')}>Opening jobs and recovery</a>
      </p>
      {error && <p role="alert">{error}</p>}
      {active && !pending.length && (
        <p>No staged library changes need recovery.</p>
      )}
      {pending.length > 0 && (
        <div role="status">
          <h3>A saved change needs recovery</h3>
          <p>
            The change was staged before the active pointer was updated. Review
            it before applying it. Existing active data and history remain
            intact.
          </p>
          <p>
            <a href={pageUrl('/data.html')}>
              Set aside an interrupted save using a verified recovery archive
            </a>
          </p>
          {pending.map((change) => (
            <details key={change.stateDigest}>
              <summary>Review saved change</summary>
              <pre>
                {change.input
                  ? JSON.stringify(change.input.command, null, 2)
                  : 'This save was interrupted before all records were written. Retry from the original editor, or download a recovery archive before further repair.'}
              </pre>
              <button
                disabled={busy || !change.input}
                type="button"
                onClick={() => {
                  void perform(async () => {
                    const result = await extensionRequest(
                      {
                        type: 'buo:service/library.resume',
                        stateDigest: change.stateDigest,
                      },
                      statusSchema,
                    );
                    if (result.head && result.data)
                      setActive({ head: result.head, data: result.data });
                    setPending([]);
                  });
                }}
              >
                Apply this saved change
              </button>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
