import { useEffect, useRef, useState } from 'preact/hooks';
import * as v from 'valibot';
import { browser } from 'wxt/browser';
import { pageUrl } from '../../infrastructure/browser/pages';
import { extensionRequest } from '../../infrastructure/browser/client';
import {
  draftResultSchema,
  type Workspace,
} from '../../domain/workspace-schema';
import { jobViewSchema, type JobView } from '../../domain/opening/schema';
import { type MutationInput } from '../../domain/storage/schema';
import { newRequestId } from '../../shared/ids';
import { serviceError } from '../../ui/services/errors';
import {
  captureTabs,
  confirmedActive,
  mutate,
  openPage,
  readWorkspace,
  targetWindow,
} from '../../ui/services/workspace';

export function Popup() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [entries, setEntries] = useState('');
  const [selected, setSelected] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [job, setJob] = useState<JobView | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const writer = useRef({
    client: newRequestId(),
    sequence: 0,
    base: null as string | null,
  });
  const pendingOpen = useRef<{
    id: string;
    text: string;
    head: Workspace['head'];
  } | null>(null);
  const pendingDelete = useRef<MutationInput | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const state = await readWorkspace();
        if (!alive) return;
        writer.current.base = state.draft.head;
        setWorkspace((current) =>
          current && current.head.revision > state.head.revision
            ? current
            : state,
        );
        const initial = state.data.settings.defaultListOpen;
        const suppliedDraft = new URLSearchParams(location.search).get('draft');
        if (suppliedDraft) {
          const lines = await extensionRequest(
            { type: 'buo:service/draft.read', id: suppliedDraft },
            v.array(v.string()),
          );
          if (alive) setEntries(lines.join('\n'));
        } else if (initial === 'previous-input')
          setEntries(state.draft.lines?.join('\n') ?? '');
        else if (initial.startsWith('list-')) {
          const list = state.data.lists.find((list) => list.id === initial);
          setSelected(list?.id ?? '');
          setEntries(list?.lines.join('\n') ?? '');
        } else {
          const result = await captureTabs();
          if (alive) {
            setEntries(result.lines.join('\n'));
            if (result.skipped)
              setNotice(
                String(result.skipped) +
                  ' unavailable or extension tabs omitted.',
              );
          }
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
  }, []);
  useEffect(() => {
    let alive = true;
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local' || !Object.hasOwn(changes, 'buo:v2:head')) return;
      void readWorkspace()
        .then((state) => {
          if (!alive) return;
          setWorkspace(state);
          setSelected((selected) =>
            state.data.lists.some((list) => list.id === selected)
              ? selected
              : '',
          );
        })
        .catch((reason: unknown) => {
          if (alive) setError(serviceError(reason));
        });
    };
    browser.storage.onChanged.addListener(changed);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);

  async function saveDraft(text: string, freeze = false) {
    const sequence = ++writer.current.sequence;
    const result = await extensionRequest(
      {
        type: freeze ? 'buo:service/draft.freeze' : 'buo:service/draft.save',
        windowId: targetWindow(),
        input: { ...writer.current, sequence, lines: text.split('\n') },
      },
      draftResultSchema,
    );
    if (sequence === writer.current.sequence) {
      if (result.saved) writer.current.base = result.current.head;
      else
        setError(
          'Another opener changed the saved draft. Your version is retained in Data & recovery. Reload before continuing to replace it.',
        );
    }
    return result.submitted;
  }
  function change(text: string) {
    setEntries(text);
    pendingOpen.current = null;
    void saveDraft(text).catch((reason: unknown) =>
      setError(serviceError(reason)),
    );
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
  async function open(text: string) {
    if (!workspace) return;
    if (!pendingOpen.current || pendingOpen.current.text !== text)
      pendingOpen.current = { id: newRequestId(), text, head: workspace.head };
    const request = pendingOpen.current;
    const result = await extensionRequest(
      {
        type: 'buo:service/open.lines',
        id: request.id,
        lines: text.split('\n'),
        expectedHead: request.head,
        windowId: targetWindow(),
      },
      jobViewSchema,
    );
    setJob(result);
    setNotice(
      result.plan.destinations.length
        ? String(result.plan.destinations.length) + ' entries queued.'
        : 'No entries could be opened. Review the results.',
    );
    pendingOpen.current = null;
  }
  const list = workspace?.data.lists.find((item) => item.id === selected);
  const pageParameters =
    targetWindow() === null ? {} : { window: targetWindow()! };
  return (
    <main class="popup">
      <header class="popup-header">
        <h1>Bulk URL Opener</h1>
        <div class="compact-links">
          <a href={pageUrl('/options.html')} target="_blank" rel="noreferrer">
            Settings
          </a>
          <a href={pageUrl('/help.html')} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
      </header>
      {error && (
        <p role="alert" class="error-message">
          {error}{' '}
          <a href={pageUrl('/data.html')} target="_blank" rel="noreferrer">
            Data & recovery
          </a>
        </p>
      )}
      <label for="entries">URLs and searches</label>
      <p id="entries-hint" class="hint">
        One entry per line.
      </p>
      <textarea
        ref={textarea}
        id="entries"
        aria-describedby="entries-hint"
        value={entries}
        rows={10}
        spellcheck={false}
        disabled={!workspace || busy}
        onInput={(event) => change(event.currentTarget.value)}
      />
      <div class="actions">
        <button
          type="button"
          class="primary"
          disabled={!workspace || busy || !entries.trim()}
          onClick={() => void perform(() => open(entries))}
        >
          Open links
        </button>
        <button
          type="button"
          disabled={!workspace || busy}
          onClick={() =>
            void perform(async () => {
              const captured = await captureTabs();
              change(captured.lines.join('\n'));
              setNotice(
                captured.skipped
                  ? String(captured.skipped) +
                      ' unavailable or extension tabs omitted.'
                  : 'Tabs captured.',
              );
            })
          }
        >
          Get current tabs
        </button>
        <button
          type="button"
          disabled={!workspace || busy}
          onClick={() => {
            change('');
            textarea.current?.focus();
          }}
        >
          Clear
        </button>
      </div>
      <label for="saved-lists">Saved lists</label>
      <div class="saved-list-controls">
        <select
          id="saved-lists"
          value={selected}
          disabled={!workspace || busy}
          onChange={(event) => {
            const id = event.currentTarget.value;
            setSelected(id);
            pendingDelete.current = null;
            const chosen = workspace?.data.lists.find((item) => item.id === id);
            if (!chosen || !workspace) return;
            if (
              workspace.data.settings.autoLoadIntoTextarea ||
              (workspace.data.settings.autoOpenLists && !override)
            )
              change(chosen.lines.join('\n'));
            if (workspace.data.settings.autoOpenLists && !override)
              void perform(() => open(chosen.lines.join('\n')));
          }}
        >
          <option value="">
            {workspace?.data.lists.length ? 'Choose a list' : 'No saved lists'}
          </option>
          {workspace?.data.lists.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || '(Unnamed list)'}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!list || busy}
          onClick={() => {
            if (list) change(list.lines.join('\n'));
          }}
        >
          Load
        </button>
        <button
          type="button"
          disabled={!workspace || busy}
          onClick={() =>
            void perform(async () => {
              const draft = await saveDraft(entries, true);
              await openPage(
                pageUrl('/new-list.html', { ...pageParameters, draft }),
              );
            })
          }
        >
          New
        </button>
        <button
          type="button"
          disabled={!list || busy}
          onClick={() => {
            if (list)
              void perform(async () => {
                await openPage(
                  pageUrl('/edit-list.html', {
                    ...pageParameters,
                    id: list.id,
                  }),
                );
              });
          }}
        >
          Edit
        </button>
        <button
          type="button"
          disabled={!list || busy}
          onClick={() => {
            if (
              !workspace ||
              !list ||
              !confirm('Delete “' + list.name + '”? Other lists will be kept.')
            )
              return;
            void perform(async () => {
              pendingDelete.current ??= {
                id: newRequestId(),
                expectedHead: workspace.head,
                command: { kind: 'list.delete', id: list.id },
              };
              const active = confirmedActive(
                await mutate(pendingDelete.current),
              );
              setWorkspace((current) =>
                current && current.head.revision > active.head.revision
                  ? current
                  : { ...(current ?? workspace), ...active },
              );
              setSelected('');
              pendingDelete.current = null;
              setNotice(
                'List deleted. A snapshot is available unless snapshots are disabled.',
              );
            });
          }}
        >
          Delete
        </button>
      </div>
      {workspace?.data.settings.autoOpenLists && (
        <label class="check-label">
          <input
            type="checkbox"
            checked={override}
            onChange={(event) => setOverride(event.currentTarget.checked)}
          />
          Pause automatic opening for this popup
        </label>
      )}
      <p class="hint popup-status" role="status">
        {busy ? 'Working…' : notice}{' '}
        {job && (
          <a
            href={pageUrl('/opening.html', { job: job.plan.id })}
            target="_blank"
            rel="noreferrer"
          >
            Progress and results
          </a>
        )}
      </p>
      <details class="popup-more">
        <summary>More</summary>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const state = await readWorkspace();
              setWorkspace((current) =>
                current && current.head.revision > state.head.revision
                  ? current
                  : state,
              );
              setNotice(
                'Saved lists refreshed. Your current entries are kept.',
              );
            })
          }
        >
          Refresh saved lists
        </button>
        <button
          type="button"
          disabled={!workspace || busy}
          onClick={() =>
            void perform(async () => {
              await extensionRequest(
                { type: 'buo:service/main.open', windowId: targetWindow() },
                v.boolean(),
              );
            })
          }
        >
          Open in a separate window
        </button>
        <a href={pageUrl('/tools.html')} target="_blank" rel="noreferrer">
          Tools
        </a>
      </details>
    </main>
  );
}
