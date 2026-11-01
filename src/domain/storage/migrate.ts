import * as v from 'valibot';
import { requireCondition } from './errors';
import { digest, stableJson, type JsonValue } from './json';
import {
  dataSchema,
  decisionsSchema,
  type CanonicalData,
  type Decisions,
  type MigrationPlan,
  type Settings,
  type Sources,
} from './schema';

export const defaultSettings: Settings = {
  tabCreationDelay: 0,
  nightMode: false,
  autoOpenLists: false,
  defaultListOpen: 'current-tabs',
  customTheme: 'defaultBootstrap',
  currentlyOpenedTabsDisplay: 'currentWindow',
  nonUrlHandler: 'searchForString',
  searchEngine: 'googleEngine',
  newTabsActive: false,
  autoLoadIntoTextarea: false,
  buttonLook: 'alwaysOutline',
  openOnLaunch: null,
  loadOnFocus: false,
  contextMenuEnabled: false,
  openUrlsInReverseOrder: false,
  automaticallyRemoveDuplicateUrls: false,
  disableSnapshots: false,
};

const fields = {
  tab_creation_delay: 'tabCreationDelay',
  night_mode: 'nightMode',
  auto_open_lists: 'autoOpenLists',
  default_list_open: 'defaultListOpen',
  custom_theme: 'customTheme',
  currently_opened_tabs_display: 'currentlyOpenedTabsDisplay',
  non_url_handler: 'nonUrlHandler',
  search_engine: 'searchEngine',
  new_tabs_active: 'newTabsActive',
  auto_load_into_textarea: 'autoLoadIntoTextarea',
  button_look: 'buttonLook',
  open_on_launch: 'openOnLaunch',
  load_on_focus: 'loadOnFocus',
  context_menu_enabled: 'contextMenuEnabled',
  open_urls_in_reverse_order: 'openUrlsInReverseOrder',
  automatically_remove_duplicate_urls: 'automaticallyRemoveDuplicateUrls',
  disable_snapshots: 'disableSnapshots',
} as const;
const enums: Partial<Record<keyof Settings, readonly string[]>> = {
  currentlyOpenedTabsDisplay: ['currentWindow', 'allOpenedTabs'],
  nonUrlHandler: ['searchForString', 'ignoreString', 'attemptToExtractURL'],
  searchEngine: ['googleEngine', 'duckduckgoEngine', 'bingEngine'],
  buttonLook: ['alwaysOutline', 'alwaysFilled', 'filledNight', 'filledLight'],
};

function object(
  value: JsonValue | undefined,
): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: JsonValue | undefined): value is string[] {
  return (
    Array.isArray(value) && value.every((line) => typeof line === 'string')
  );
}
function parse(value: string): JsonValue | undefined {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return undefined;
  }
}
function legacyId(value: JsonValue | undefined): number | undefined {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value))
    value = Number(value);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function number(value: JsonValue): number | undefined {
  if (
    typeof value === 'string' &&
    /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
  )
    value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
function normalize(
  key: keyof Settings,
  value: JsonValue,
): JsonValue | undefined {
  if (key === 'tabCreationDelay') return number(value);
  if (key === 'customTheme') {
    if (value === 'defaultBoostrap' || value === 'defaultBootstrap')
      return 'defaultBootstrap';
    return value === 'fluentDesignBootstrap' ? value : undefined;
  }
  if (key === 'defaultListOpen') {
    if (value === -1 || value === '-1') return 'current-tabs';
    if (value === -2 || value === '-2') return 'previous-input';
    return legacyId(value);
  }
  if (key === 'openOnLaunch')
    return value === 'no_list' ? null : legacyId(value);
  const choices = enums[key];
  if (choices)
    return typeof value === 'string' && choices.includes(value)
      ? value
      : undefined;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return undefined;
}

export async function analyzeSources(sources: Sources): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    lists: [],
    preferences: [],
    issues: [],
    archives: [],
    draftLines: null,
    recoveredInputs: [],
  };
  const preferences: {
    key: keyof Settings;
    value: JsonValue;
    source: string;
  }[] = [];
  function issue(code: string, source: string, detail: string) {
    plan.issues.push({ code, source, detail });
  }
  function settings(value: JsonValue | undefined, source: string) {
    if (!object(value)) {
      issue(
        'invalid-settings',
        source,
        'Settings cannot be read; raw data is retained.',
      );
      return;
    }
    if (
      Object.hasOwn(value, 'object_description') &&
      value.object_description !== 'user_settings'
    )
      issue(
        'invalid-settings-marker',
        source,
        'The settings marker is unexpected. Only recognized valid preferences are proposed; the complete original is retained.',
      );
    for (const [field, raw] of Object.entries(value)) {
      if (field === 'object_description') continue;
      const key = Object.hasOwn(fields, field)
        ? fields[field as keyof typeof fields]
        : undefined;
      if (!key) {
        issue(
          'unknown-setting',
          source + '.' + field,
          'An unknown preference is retained in recovery only.',
        );
        continue;
      }
      const value = normalize(key, raw);
      if (value === undefined)
        issue(
          'invalid-setting',
          source + '.' + field,
          'This preference is invalid; another valid copy or the displayed default is proposed.',
        );
      else preferences.push({ key, value, source });
    }
  }
  async function list(
    value: JsonValue | undefined,
    source: string,
    reconstructed = false,
  ) {
    const id = object(value) ? legacyId(value.list_id) : undefined;
    if (
      !object(value) ||
      value.object_description !== 'list_storage' ||
      id === undefined ||
      typeof value.list_name !== 'string' ||
      !strings(value.list_links)
    ) {
      issue(
        'invalid-list',
        source,
        'This list cannot be reconstructed safely; its exact raw value is retained.',
      );
      return;
    }
    const content = {
      legacyId: id,
      name: value.list_name,
      lines: value.list_links,
    };
    const internalId = 'list-' + (await digest(content));
    const existing = plan.lists.find((entry) => entry.id === internalId);
    if (existing) {
      existing.sources.push(source);
      existing.reconstructed &&= reconstructed;
      return;
    }
    plan.lists.push({
      id: internalId,
      ...content,
      sources: [source],
      reconstructed,
    });
    if (!value.list_name.length)
      issue('empty-name', source, 'The empty list name is preserved.');
    if (
      Object.keys(value).some(
        (key) =>
          ![
            'object_description',
            'list_id',
            'list_name',
            'list_links',
          ].includes(key),
      )
    )
      issue(
        'unknown-list-field',
        source,
        'Additional list fields are retained in the raw recovery copy.',
      );
  }
  function archive(
    value: JsonValue | undefined,
    source: string,
    kind: 'snapshot' | 'sync',
  ) {
    if (typeof value === 'string') value = parse(value);
    const valid =
      object(value) &&
      Array.isArray(value.lists) &&
      object(value.settings) &&
      value.lists.every(
        (item) =>
          object(item) &&
          item.object_description === 'list_storage' &&
          legacyId(item.list_id) !== undefined &&
          typeof item.list_name === 'string' &&
          strings(item.list_links),
      );
    plan.archives.push({
      kind,
      source,
      valid,
      listCount:
        valid && object(value) && Array.isArray(value.lists)
          ? value.lists.length
          : 0,
    });
    if (!valid)
      issue(
        'invalid-archive',
        source,
        'This archive is damaged; the original is retained without activating it.',
      );
    if (
      kind === 'snapshot' &&
      object(value) &&
      (typeof value.snapshot_time !== 'string' ||
        !Number.isFinite(Date.parse(value.snapshot_time)))
    )
      issue(
        'invalid-snapshot-time',
        source,
        'The original snapshot timestamp is retained without guessing a replacement.',
      );
  }

  for (const [key, raw] of Object.entries(sources.localStorage).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  )) {
    const source = 'localStorage[' + JSON.stringify(key) + ']';
    const value = parse(raw);
    if (key === 'settings') {
      if (raw.startsWith('settings,') && raw.split(',').length === 2) {
        settings({ tab_creation_delay: raw.slice('settings,'.length) }, source);
      } else settings(value, source);
    } else if (key === 'maxID') {
      if (legacyId(raw) === undefined)
        issue(
          'invalid-counter',
          source,
          'The old counter is invalid. New stable identities do not depend on it.',
        );
    } else if (key === 'previous_list_input') {
      if (strings(value)) plan.draftLines = value;
      else
        issue(
          'invalid-draft',
          source,
          'The unreadable draft is retained in the raw recovery copy.',
        );
    } else if (key === 'temp' || key === 'linksToOpen') {
      const marker = key === 'temp' ? 'temp_storage' : 'link_to_open';
      if (
        object(value) &&
        value.object_description === marker &&
        strings(value.list_links)
      ) {
        plan.recoveredInputs.push({
          kind: key === 'temp' ? 'new-list-draft' : 'pending-opening',
          lines: value.list_links,
          source,
        });
      } else
        issue(
          'invalid-staging',
          source,
          'Staged input is retained in recovery only; it will not be opened automatically.',
        );
    } else if (key === 'storage_snapshots') {
      if (object(value) && Array.isArray(value.backups)) {
        value.backups.forEach((entry, index) =>
          archive(
            entry,
            source + '.backups[' + String(index) + ']',
            'snapshot',
          ),
        );
      } else
        issue(
          'invalid-snapshots',
          source,
          'The snapshot container is damaged and retained verbatim.',
        );
    } else if (object(value) && value.object_description === 'list_storage') {
      await list(value, source);
    } else if (raw.startsWith('listStorage,') || /^(0|[1-9]\d*),/.test(raw)) {
      const parts = raw.split(',');
      if (parts[0] === 'listStorage') parts.shift();
      const [id, name, ...links] = parts;
      await list(
        {
          object_description: 'list_storage',
          list_id: id ?? null,
          list_name: name ?? null,
          list_links: links,
        },
        source,
        true,
      );
      issue(
        'ambiguous-comma-record',
        source,
        'Commas may have belonged to the name or URL. Review the proposed split and explicitly include it or retain it only in recovery.',
      );
    } else
      issue(
        'unrecognized-record',
        source,
        'An unknown or malformed record is retained in recovery only.',
      );
  }
  if (Object.hasOwn(sources.storageLocal, 'userSettings'))
    settings(sources.storageLocal.userSettings, 'storage.local.userSettings');
  if (Object.hasOwn(sources.storageLocal, 'lists')) {
    if (Array.isArray(sources.storageLocal.lists)) {
      for (const [index, item] of sources.storageLocal.lists.entries())
        await list(item, 'storage.local.lists[' + String(index) + ']');
    } else
      issue(
        'invalid-mirror',
        'storage.local.lists',
        'The background list mirror is unreadable and retained verbatim.',
      );
  }
  for (const key of Object.keys(sources.storageLocal))
    if (!['userSettings', 'lists'].includes(key))
      issue(
        'unknown-local-record',
        'storage.local.' + key,
        'Additional storage data is retained in recovery only.',
      );
  for (const [key, value] of Object.entries(sources.storageSync)) {
    if (key === 'user_settings')
      archive(value, 'storage.sync.user_settings', 'sync');
    else
      issue(
        'unknown-sync-record',
        'storage.sync.' + key,
        'Additional sync data is retained in the recovery copy.',
      );
  }
  for (const entry of plan.lists) {
    if (
      plan.lists.some(
        (other) => other.id !== entry.id && other.legacyId === entry.legacyId,
      )
    )
      issue(
        'conflicting-list',
        entry.sources.join(', '),
        'Different contents share an old list ID. Both versions are retained with distinct new IDs.',
      );
    if (entry.sources.every((source) => source.startsWith('storage.local.')))
      issue(
        'mirror-only-list',
        entry.sources.join(', '),
        'This list exists only in the background mirror. It is retained; its recency is unknown.',
      );
  }

  const fresh =
    !Object.keys(sources.localStorage).length &&
    !Object.keys(sources.storageLocal).length &&
    !Object.keys(sources.storageSync).length;
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const values = preferences.filter((entry) => entry.key === key);
    if (!values.length)
      values.push({
        key,
        value:
          key === 'contextMenuEnabled' && fresh ? true : defaultSettings[key],
        source: fresh
          ? 'Fresh-install default'
          : 'Default for missing or invalid preference',
      });
    const options: MigrationPlan['preferences'][number]['options'] = [];
    async function option(value: JsonValue, source: string) {
      const id = await digest({ key, value });
      const existing = options.find((entry) => entry.id === id);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      } else options.push({ id, value, sources: [source] });
    }
    for (const entry of values) {
      if (
        typeof entry.value === 'number' &&
        (key === 'defaultListOpen' || key === 'openOnLaunch')
      ) {
        const matches = plan.lists.filter(
          (list) => list.legacyId === entry.value,
        );
        for (const match of matches) await option(match.id, entry.source);
        if (!matches.length || matches.some((list) => list.reconstructed)) {
          await option(
            key === 'defaultListOpen' ? 'current-tabs' : null,
            'Safe unset reference',
          );
          if (!matches.length)
            issue(
              'dangling-reference',
              entry.source + '.' + key,
              'A referenced list is missing. The displayed unset value is proposed; the original is retained.',
            );
        }
      } else await option(entry.value, entry.source);
    }
    plan.preferences.push({ key, options });
  }
  return plan;
}

export function createCandidate(
  plan: MigrationPlan,
  input: Decisions,
): CanonicalData {
  const decisions = v.parse(decisionsSchema, input);
  requireCondition(
    !plan.issues.length || decisions.acknowledgeIssues,
    'REVIEW_REQUIRED',
  );
  requireCondition(
    Object.keys(decisions.preferences).every((key) =>
      plan.preferences.some((item) => item.key === key),
    ),
    'INVALID_DECISIONS',
  );
  const historical = plan.lists.filter((list) => list.reconstructed);
  requireCondition(
    Object.keys(decisions.historical).every((id) =>
      historical.some((list) => list.id === id),
    ),
    'INVALID_DECISIONS',
  );
  requireCondition(
    historical.every((list) => Object.hasOwn(decisions.historical, list.id)),
    'HISTORICAL_REVIEW_REQUIRED',
  );
  const settings = Object.fromEntries(
    plan.preferences.map(({ key, options }) => {
      const selected = decisions.preferences[key];
      const choice = selected
        ? options.find((entry) => entry.id === selected)
        : options.length === 1
          ? options[0]
          : undefined;
      requireCondition(choice, 'PREFERENCE_CHOICE_REQUIRED');
      return [key, choice.value];
    }),
  );
  const lists = plan.lists
    .filter(
      (list) =>
        !list.reconstructed || decisions.historical[list.id] === 'include',
    )
    .map(({ id, legacyId, name, lines, sources }) => ({
      id,
      legacyId,
      name,
      lines,
      sources,
    }));
  const result = v.safeParse(dataSchema, {
    lists,
    settings,
    draftLines: plan.draftLines,
    recoveredInputs: plan.recoveredInputs,
  });
  requireCondition(result.success, 'REFERENCE_UNAVAILABLE');
  return result.output;
}

export function sameContent(a: unknown, b: unknown): boolean {
  try {
    return stableJson(a) === stableJson(b);
  } catch {
    return false;
  }
}
