import { useEffect, useRef, useState } from 'preact/hooks';
import * as v from 'valibot';
import { PageLayout } from './PageLayout';
import { extensionRequest } from '../infrastructure/browser/client';
import { pageUrl } from '../infrastructure/browser/pages';
import { type Workspace } from '../domain/workspace-schema';
import { type MutationInput } from '../domain/storage/schema';
import { newRequestId } from '../shared/ids';
import {
  captureTabs,
  confirmedActive,
  mutate,
  readWorkspace,
} from './services/workspace';
import { serviceError } from './services/errors';

export function ListEditor({ mode }: { mode: 'create' | 'edit' }) {
  const [name, setName] = useState('');
  const [entries, setEntries] = useState('');
  const [active, setActive] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef<MutationInput | null>(null);
  const saved = useRef(false);
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const state = await readWorkspace();
        let initialName = '',
          initialEntries = '';
        if (mode === 'edit') {
          const list = state.data.lists.find((item) => item.id === id);
          if (!list) throw new Error('LIST_NOT_FOUND');
          initialName = list.name;
          initialEntries = list.lines.join('\n');
        } else {
          const draft = new URLSearchParams(location.search).get('draft');
          if (draft)
            initialEntries = (
              await extensionRequest(
                { type: 'buo:service/draft.read', id: draft },
                v.array(v.string()),
              )
            ).join('\n');
        }
        if (alive) {
          setActive(state);
          setName(initialName);
          setEntries(initialEntries);
        }
      } catch (reason) {
        if (alive) setError(serviceError(reason));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, mode]);
  function edited() {
    pending.current = null;
    saved.current = false;
    setNotice('');
  }
  return (
    <PageLayout
      title={mode === 'create' ? 'New list' : 'Edit list'}
      busy={busy}
    >
      {error && (
        <p role="alert" class="error-message">
          {error}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!active || busy) return;
          setBusy(true);
          setError('');
          setNotice('');
          pending.current ??= {
            id: newRequestId(),
            expectedHead: active.head,
            command:
              mode === 'create'
                ? { kind: 'list.create', name, lines: entries.split('\n') }
                : {
                    kind: 'list.update',
                    id: id!,
                    name,
                    lines: entries.split('\n'),
                  },
          };
          void mutate(pending.current)
            .then((result) => {
              const state = confirmedActive(result);
              setActive({ ...active, ...state });
              const savedId =
                mode === 'create' ? 'list-' + pending.current!.id : id!;
              if (mode === 'create')
                location.assign(
                  pageUrl('/edit-list.html', { id: savedId, saved: 1 }),
                );
              pending.current = null;
              saved.current = true;
              setNotice('List saved.');
              setConflict(false);
            })
            .catch((reason: unknown) => {
              setError(serviceError(reason));
              if (
                reason instanceof Error &&
                reason.message === 'REVISION_CONFLICT'
              )
                setConflict(true);
            })
            .finally(() => setBusy(false));
        }}
      >
        <label for="list-name">List name</label>
        <input
          id="list-name"
          value={name}
          required
          disabled={!active || busy}
          onInput={(event) => {
            setName(event.currentTarget.value);
            edited();
          }}
          autoComplete="off"
        />
        <label for="list-entries">URLs and searches</label>
        <p id="entries-hint" class="hint">
          One entry per line. Original text and line order are kept when saved.
        </p>
        <textarea
          id="list-entries"
          aria-describedby="entries-hint"
          value={entries}
          rows={14}
          spellcheck={false}
          disabled={!active || busy}
          onInput={(event) => {
            setEntries(event.currentTarget.value);
            edited();
          }}
        />
        <div class="actions">
          <button
            type="submit"
            class="primary"
            disabled={
              !active || busy || conflict || !name.trim() || saved.current
            }
          >
            Save list
          </button>
          <button
            type="button"
            disabled={!active || busy}
            onClick={() => {
              setBusy(true);
              void captureTabs()
                .then((result) => {
                  setEntries(result.lines.join('\n'));
                  edited();
                  setNotice(
                    result.skipped
                      ? String(result.skipped) +
                          ' unavailable or extension tabs omitted.'
                      : 'Tabs captured. Save to keep these changes.',
                  );
                })
                .catch((reason: unknown) => setError(serviceError(reason)))
                .finally(() => setBusy(false));
            }}
          >
            Use current tabs
          </button>
          <button
            type="button"
            disabled={!active || busy}
            onClick={() => {
              setEntries('');
              edited();
            }}
          >
            Clear entries
          </button>
        </div>
      </form>
      {conflict && (
        <div>
          <p>
            Your entries are kept above. Refresh the revision to review the
            latest saved list before trying again.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void readWorkspace()
                .then((state) => {
                  setActive(state);
                  pending.current = null;
                  setConflict(false);
                  setNotice(
                    'Latest revision loaded. Your unsaved entries are kept. Compare the saved version below before saving.',
                  );
                })
                .catch((reason: unknown) => setError(serviceError(reason)))
                .finally(() => setBusy(false));
            }}
          >
            Keep my entries and refresh saved revision
          </button>
        </div>
      )}
      {mode === 'edit' && active && (
        <details>
          <summary>Compare with saved version</summary>
          <p>{active.data.lists.find((item) => item.id === id)?.name}</p>
          <pre>
            {active.data.lists.find((item) => item.id === id)?.lines.join('\n')}
          </pre>
        </details>
      )}
      <p role="status">
        {busy
          ? 'Working…'
          : notice || (params.get('saved') === '1' ? 'List saved.' : '')}
      </p>
      <p>
        <a href={pageUrl('/popup.html')}>Return to the opener</a>
      </p>
    </PageLayout>
  );
}
