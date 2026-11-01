import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import * as v from 'valibot';
import {
  dataSchema,
  hashSchema,
  headSchema,
  mutationInputSchema,
  statusSchema,
} from '../../domain/storage/schema';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { newRequestId } from '../../shared/ids';
import { serviceError } from './errors';

const activeSchema = v.strictObject({ head: headSchema, data: dataSchema });
const pendingSchema = v.array(
  v.strictObject({ stateDigest: hashSchema, input: mutationInputSchema }),
);
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
        area !== 'local' ||
        !Object.keys(changes).some(
          (key) => key === 'buo:v2:head' || key.startsWith('buo:v2:state:'),
        )
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void read();
      }, 150);
    }
    browser.storage.onChanged.addListener(changed);
    void read();
    return () => {
      mounted = false;
      clearTimeout(timer);
      browser.storage.onChanged.removeListener(changed);
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
      <h2 id="services-title">Shared services</h2>
      <p>
        <a href={pageUrl('/opening.html')}>Opening jobs and recovery</a>
      </p>
      {error && <p role="alert">{error}</p>}
      {active && (
        <label class="check-label">
          <input
            type="checkbox"
            checked={active.data.settings.contextMenuEnabled}
            disabled={busy || pending.length > 0}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              void perform(async () => {
                const result = await extensionRequest(
                  {
                    type: 'buo:service/library.mutate',
                    input: {
                      id: newRequestId(),
                      expectedHead: active.head,
                      command: {
                        kind: 'settings.update',
                        patch: { contextMenuEnabled: enabled },
                      },
                    },
                  },
                  statusSchema,
                );
                if (result.head && result.data)
                  setActive({ head: result.head, data: result.data });
              });
            }}
          />
          Show saved lists in the context menu
        </label>
      )}
      {pending.length > 0 && (
        <div role="status">
          <h3>A saved change needs recovery</h3>
          <p>
            The change was staged before the active pointer was updated. Review
            it before applying it. Existing active data and history remain
            intact.
          </p>
          {pending.map((change) => (
            <details key={change.stateDigest}>
              <summary>Review saved change</summary>
              <pre>{JSON.stringify(change.input.command, null, 2)}</pre>
              <button
                disabled={busy}
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
