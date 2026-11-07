import { useEffect, useRef, useState } from 'preact/hooks';
import { type Settings, type MutationInput } from '../../domain/storage/schema';
import { type Workspace } from '../../domain/workspace-schema';
import { newRequestId } from '../../shared/ids';
import { confirmedActive, mutate, readWorkspace } from './workspace';
import { serviceError } from './errors';
import { settingLabels } from '../recovery/labels';
import { pageUrl } from '../../infrastructure/browser/pages';

const groups: { title: string; keys: (keyof Settings)[] }[] = [
  {
    title: 'Opening',
    keys: [
      'tabCreationDelay',
      'nonUrlHandler',
      'searchEngine',
      'newTabsActive',
      'loadOnFocus',
      'openUrlsInReverseOrder',
      'automaticallyRemoveDuplicateUrls',
    ],
  },
  {
    title: 'Lists and capture',
    keys: [
      'defaultListOpen',
      'autoLoadIntoTextarea',
      'autoOpenLists',
      'openOnLaunch',
      'currentlyOpenedTabsDisplay',
      'contextMenuEnabled',
    ],
  },
  {
    title: 'Appearance',
    keys: ['nightMode', 'customTheme', 'buttonLook'],
  },
];
const choices = {
  nonUrlHandler: [
    ['searchForString', 'Search for text'],
    ['ignoreString', 'Ignore text'],
    ['attemptToExtractURL', 'Extract a URL'],
  ],
  searchEngine: [
    ['googleEngine', 'Google'],
    ['duckduckgoEngine', 'DuckDuckGo'],
    ['bingEngine', 'Bing'],
  ],
  currentlyOpenedTabsDisplay: [
    ['currentWindow', 'Current window'],
    ['allOpenedTabs', 'All normal windows'],
  ],
  customTheme: [
    ['defaultBootstrap', 'Default'],
    ['fluentDesignBootstrap', 'Fluent'],
  ],
  buttonLook: [
    ['alwaysOutline', 'Outlined'],
    ['alwaysFilled', 'Filled'],
    ['filledNight', 'Filled in dark mode'],
    ['filledLight', 'Filled in light mode'],
  ],
} as const;

export function SettingsForm() {
  const [active, setActive] = useState<Workspace | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [delay, setDelay] = useState('0');
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<MutationInput | null>(null);
  async function load() {
    setBusy(true);
    setError('');
    try {
      const state = await readWorkspace();
      setActive(state);
      setSettings(state.data.settings);
      setDelay(String(state.data.settings.tabCreationDelay));
      setDirty(false);
      setConflict(false);
      pending.current = null;
    } catch (reason) {
      setError(serviceError(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(key: keyof Settings, value: Settings[keyof Settings]) {
    if (settings) setSettings({ ...settings, [key]: value });
    setDirty(true);
    setNotice('');
    pending.current = null;
  }
  function saveSettings() {
    if (!active || !settings || busy || conflict) return;
    const value = Number(delay);
    if (!delay.trim() || !Number.isFinite(value) || value < 0) {
      setError(
        'Enter a delay of zero or more seconds. Fractional seconds are supported.',
      );
      return;
    }
    pending.current ??= {
      id: newRequestId(),
      expectedHead: active.head,
      command: {
        kind: 'settings.update',
        patch: { ...settings, tabCreationDelay: value },
      },
    };
    setBusy(true);
    setError('');
    void mutate(pending.current)
      .then((result) => {
        const state = confirmedActive(result);
        setActive({ ...active, ...state });
        setSettings(state.data.settings);
        setDirty(false);
        setNotice('Settings saved.');
        pending.current = null;
      })
      .catch((reason: unknown) => {
        setError(serviceError(reason));
        if (reason instanceof Error && reason.message === 'REVISION_CONFLICT')
          setConflict(true);
      })
      .finally(() => setBusy(false));
  }
  const latestSave = useRef(saveSettings);
  latestSave.current = saveSettings;
  useEffect(() => {
    if (
      !dirty ||
      busy ||
      conflict ||
      error ||
      !delay.trim() ||
      !Number.isFinite(Number(delay)) ||
      Number(delay) < 0
    )
      return;
    const timer = setTimeout(() => latestSave.current(), 700);
    return () => clearTimeout(timer);
  }, [settings, delay, dirty, busy, conflict, error]);
  if (!settings || !active)
    return (
      <section aria-labelledby="preferences-heading" aria-busy={busy}>
        <h2 id="preferences-heading">Preferences</h2>
        <p role="status">{busy ? 'Loading preferences…' : error}</p>
        {!busy && <button onClick={() => void load()}>Load preferences</button>}
      </section>
    );
  return (
    <section aria-labelledby="preferences-heading" aria-busy={busy}>
      <h2 id="preferences-heading">Preferences</h2>
      <p>
        Valid changes save automatically after a short pause. You can also save
        explicitly. Existing opening jobs keep the settings they started with.
      </p>
      {error && (
        <p role="alert" class="error-message">
          {error}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveSettings();
        }}
      >
        {active.private && (
          <p class="hint">
            Private preferences last for this session. Browser startup and the
            global context menu are managed in a regular window; that menu uses
            regular saved lists.
          </p>
        )}
        {groups.map((group) => (
          <fieldset key={group.title} disabled={busy}>
            <legend>{group.title}</legend>
            {group.keys.map((key) => {
              const label = settingLabels[key],
                id = 'setting-' + key,
                value = settings[key];
              if (typeof value === 'boolean')
                return (
                  <label key={key} class="check-label">
                    <input
                      id={id}
                      type="checkbox"
                      checked={value}
                      disabled={
                        Boolean(active.private) && key === 'contextMenuEnabled'
                      }
                      onChange={(event) =>
                        change(key, event.currentTarget.checked)
                      }
                    />
                    {label}
                  </label>
                );
              if (key === 'tabCreationDelay')
                return (
                  <div key={key}>
                    <label for={id}>{label}</label>
                    <input
                      id={id}
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={delay}
                      onInput={(event) => {
                        setDelay(event.currentTarget.value);
                        setDirty(true);
                        pending.current = null;
                      }}
                    />
                  </div>
                );
              const options: readonly (readonly [string, string])[] =
                key === 'defaultListOpen'
                  ? [
                      ['current-tabs', 'Current tabs'],
                      ['previous-input', 'Previous typed entries'],
                      ...active.data.lists.map((list): [string, string] => [
                        list.id,
                        list.name || '(Unnamed list)',
                      ]),
                    ]
                  : key === 'openOnLaunch'
                    ? [
                        ['', 'None'],
                        ...active.data.lists.map((list): [string, string] => [
                          list.id,
                          list.name || '(Unnamed list)',
                        ]),
                      ]
                    : Object.hasOwn(choices, key)
                      ? choices[key as keyof typeof choices]
                      : [];
              return (
                <div class="setting-row" key={key}>
                  <label for={id}>{label}</label>
                  <select
                    id={id}
                    disabled={Boolean(active.private) && key === 'openOnLaunch'}
                    value={value ?? ''}
                    onChange={(event) =>
                      change(
                        key,
                        key === 'openOnLaunch' && !event.currentTarget.value
                          ? null
                          : event.currentTarget.value,
                      )
                    }
                  >
                    {options.map(([option, text]) => (
                      <option key={option} value={option}>
                        {active.private &&
                        key === 'currentlyOpenedTabsDisplay' &&
                        option === 'allOpenedTabs'
                          ? 'All private windows'
                          : text}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </fieldset>
        ))}
        <p class="hint">
          Load-on-focus creates a holding page for each destination. File and
          browser-internal URLs remain subject to browser restrictions. Startup
          opening runs only on a browser startup event.
        </p>
        <div class="actions">
          <button
            class="primary"
            type="submit"
            disabled={busy || !dirty || conflict}
          >
            Save settings
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                confirm(
                  'Reload saved settings and discard the unsaved choices shown here?',
                )
              )
                void load();
            }}
          >
            Reload saved settings
          </button>
        </div>
        <p role="status">
          {busy ? 'Saving…' : notice || (dirty ? 'Unsaved changes.' : '')}
        </p>
      </form>
      <h2>Saved lists</h2>
      <p>
        <a class="button" href={pageUrl('/new-list.html')}>
          Create a list
        </a>
      </p>
      {active.data.lists.length ? (
        <ul class="list-index">
          {active.data.lists.map((list) => (
            <li key={list.id}>
              <a href={pageUrl('/edit-list.html', { id: list.id })}>
                {list.name || '(Unnamed list)'}
              </a>
              <span class="hint">{list.lines.length} entries</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No saved lists yet.</p>
      )}
    </section>
  );
}
