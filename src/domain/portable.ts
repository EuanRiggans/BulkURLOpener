import * as v from 'valibot';
import {
  dataSchema,
  listIdSchema,
  settingsSchema,
  type CanonicalData,
} from './storage/schema';
import { requireCondition } from './storage/errors';

const portableShape = v.strictObject({
  format: v.literal('bulk-url-opener'),
  version: v.literal(2),
  lists: v.array(
    v.strictObject({
      id: listIdSchema,
      name: v.string(),
      lines: v.array(v.string()),
    }),
  ),
  settings: settingsSchema,
});
export const portableSchema = v.pipe(
  portableShape,
  v.check(
    (data) =>
      v.is(dataSchema, {
        lists: data.lists.map((list) => ({
          ...list,
          legacyId: null,
          sources: [],
        })),
        settings: data.settings,
        draftLines: null,
        recoveredInputs: [],
      }),
    'Saved-list identities and references must be valid.',
  ),
);
export type Portable = v.InferOutput<typeof portableSchema>;
export function toPortable(data: CanonicalData): Portable {
  return {
    format: 'bulk-url-opener',
    version: 2,
    lists: data.lists.map(({ id, name, lines }) => ({ id, name, lines })),
    settings: structuredClone(data.settings),
  };
}
export function portableData(
  raw: unknown,
): Pick<CanonicalData, 'lists' | 'settings'> {
  const parsed = v.safeParse(portableSchema, raw);
  requireCondition(parsed.success, 'IMPORT_INVALID');
  const value = parsed.output;
  const data = v.safeParse(dataSchema, {
    lists: value.lists.map((list) => ({
      ...list,
      legacyId: null,
      sources: [],
    })),
    settings: value.settings,
    draftLines: null,
    recoveredInputs: [],
  });
  requireCondition(data.success, 'IMPORT_INVALID');
  return { lists: data.output.lists, settings: data.output.settings };
}

export function legacyExport(data: CanonicalData): unknown {
  const allocated = new Set<number>();
  const reserved = new Set(
    data.lists.flatMap((list) =>
      list.legacyId === null ? [] : [list.legacyId],
    ),
  );
  const mapping = new Map<string, number>();
  let next = 0;
  for (const list of data.lists) {
    let id = list.legacyId;
    if (id === null || allocated.has(id)) {
      while (allocated.has(next) || reserved.has(next)) next++;
      id = next;
    }
    allocated.add(id);
    mapping.set(list.id, id);
  }
  const s = data.settings;
  return {
    maxID: String([...allocated].reduce((max, id) => Math.max(max, id), 0)),
    lists: data.lists.map((list) => ({
      object_description: 'list_storage',
      list_id: mapping.get(list.id),
      list_name: list.name,
      list_links: list.lines,
    })),
    settings: {
      object_description: 'user_settings',
      tab_creation_delay: s.tabCreationDelay,
      night_mode: Number(s.nightMode),
      auto_open_lists: Number(s.autoOpenLists),
      default_list_open:
        s.defaultListOpen === 'current-tabs'
          ? -1
          : s.defaultListOpen === 'previous-input'
            ? -2
            : mapping.get(s.defaultListOpen),
      custom_theme:
        s.customTheme === 'defaultBootstrap'
          ? 'defaultBoostrap'
          : s.customTheme,
      currently_opened_tabs_display: s.currentlyOpenedTabsDisplay,
      non_url_handler: s.nonUrlHandler,
      search_engine: s.searchEngine,
      new_tabs_active: Number(s.newTabsActive),
      auto_load_into_textarea: Number(s.autoLoadIntoTextarea),
      button_look: s.buttonLook,
      open_on_launch:
        s.openOnLaunch === null
          ? 'no_list'
          : String(mapping.get(s.openOnLaunch)),
      load_on_focus: Number(s.loadOnFocus),
      context_menu_enabled: Number(s.contextMenuEnabled),
      open_urls_in_reverse_order: Number(s.openUrlsInReverseOrder),
      automatically_remove_duplicate_urls: Number(
        s.automaticallyRemoveDuplicateUrls,
      ),
      disable_snapshots: Number(s.disableSnapshots),
    },
  };
}
