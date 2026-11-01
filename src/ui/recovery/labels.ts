import type { JsonValue } from '../../domain/storage/json';
import type { MigrationPlan, Settings } from '../../domain/storage/schema';

export const settingLabels: Record<keyof Settings, string> = {
  tabCreationDelay: 'Delay between tabs (seconds)',
  nightMode: 'Dark appearance',
  autoOpenLists: 'Open a list when selected',
  defaultListOpen: 'Initial popup contents',
  customTheme: 'Theme',
  currentlyOpenedTabsDisplay: 'Tab capture scope',
  nonUrlHandler: 'Entries that are not URLs',
  searchEngine: 'Search engine',
  newTabsActive: 'Activate the final new tab',
  autoLoadIntoTextarea: 'Load a list when selected',
  buttonLook: 'Button appearance',
  openOnLaunch: 'List to open at browser startup',
  loadOnFocus: 'Load destinations when tabs are selected',
  contextMenuEnabled: 'Saved lists in the context menu',
  openUrlsInReverseOrder: 'Open URLs in reverse order',
  automaticallyRemoveDuplicateUrls: 'Remove duplicate URLs when opening',
  disableSnapshots: 'Disable automatic snapshots',
};
const valueLabels: Record<string, string> = {
  'current-tabs': 'Current tabs',
  'previous-input': 'Previous typed entries',
  defaultBootstrap: 'Default',
  fluentDesignBootstrap: 'Fluent',
  currentWindow: 'Current window',
  allOpenedTabs: 'All windows',
  searchForString: 'Search for text',
  ignoreString: 'Ignore text',
  attemptToExtractURL: 'Extract a URL',
  googleEngine: 'Google',
  duckduckgoEngine: 'DuckDuckGo',
  bingEngine: 'Bing',
  alwaysOutline: 'Outlined',
  alwaysFilled: 'Filled',
  filledNight: 'Filled in dark mode',
  filledLight: 'Filled in light mode',
};
export function preferenceLabel(value: JsonValue, plan: MigrationPlan): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const list = plan.lists.find((list) => list.id === value);
    if (list)
      return (
        (list.name || '(Unnamed list)') +
        ' — old ID ' +
        String(list.legacyId) +
        ' (' +
        sourceLabel(list.sources[0] ?? '') +
        ')'
      );
    return Object.hasOwn(valueLabels, value) ? valueLabels[value]! : value;
  }
  return JSON.stringify(value);
}
export function sourceLabel(source: string): string {
  if (source.startsWith('localStorage')) return 'Page storage';
  if (source.startsWith('storage.local')) return 'Background mirror';
  if (source.startsWith('storage.sync')) return 'Browser sync copy';
  return source;
}

export function recoveryError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    SOURCES_CHANGED:
      'The source data changed after inspection. Inspect it again before migrating.',
    STORAGE_WRITE_FAILED:
      'The write did not complete. Storage may be full or the background may have stopped. Check the status and download a recovery file before retrying. Original data was not removed.',
    STORAGE_READ_FAILED:
      'Browser storage could not be read. Migration is blocked; no defaults will replace unreadable data.',
    WRITE_VERIFICATION_FAILED:
      'Written data did not match when read back. Migration is blocked until integrity can be verified. Download a recovery file.',
    INTEGRITY_CHECK_FAILED:
      'Stored data could not be verified. Migration is blocked. Download a recovery file; do not clear browser storage.',
    UNKNOWN_STORAGE_VERSION:
      'Unrecognized redevelopment data is present. Migration is blocked to preserve it. Download a recovery file.',
    ORPHANED_STATE:
      'An earlier state has no matching active pointer. It is retained, and migration is blocked to protect it. Download a recovery file for recovery.',
    REVISION_CONFLICT:
      'Another operation changed the active state. Check the status before trying again.',
    LOCK_UNAVAILABLE:
      'This browser cannot acquire the storage writer lock. Migration is blocked.',
    ALREADY_ACTIVE: 'Data is already migrated. Check the current status below.',
    REFERENCE_UNAVAILABLE:
      'A selected preference points to an excluded historical list. Include that list or choose the unset preference.',
  };
  return Object.hasOwn(messages, code)
    ? messages[code]!
    : 'The operation could not be completed. Check the status before retrying. No recovery records were removed.';
}
