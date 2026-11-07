import { recoveryError } from '../recovery/labels';

export function serviceError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    WINDOW_SCOPE_MISMATCH:
      'This action must stay within the same regular or private workspace. Refresh the opener in the intended window.',
    PRIVATE_ACCESS_REQUIRED:
      'Allow this extension in private windows using the browser extension settings first.',
    PRIVATE_SETUP_REQUIRED:
      'Open extension Settings in a regular window and migrate your data first. Private windows cannot perform persistent migration.',
    PRIVATE_STORAGE_UNAVAILABLE:
      'Temporary private storage is unavailable. Try reopening the private workspace.',
    PRIVATE_SYNC_UNAVAILABLE:
      'Previous browser-sync copies can be recovered only from a regular window.',
    PRIVATE_MIGRATION_UNAVAILABLE:
      'Persistent migration and migration undo are available only from a regular window.',
    PRIVATE_PREFERENCE_UNAVAILABLE:
      'Startup and global context-menu preferences are managed from a regular window.',
    PRIVATE_SESSION_ENDED:
      'That private session ended. Its temporary data was cleared. Open a new private workspace to continue.',
    PRIVATE_SESSION_INVALID:
      'The private workspace could not be verified. Regular saved data is unchanged. Close every private window to end this temporary session.',
    CLIPBOARD_UNAVAILABLE:
      'Clipboard access was unavailable. Select and copy the displayed text, or use Download.',
    WORKSPACE_INTEGRITY_FAILED:
      'A draft, recovery copy or transfer record could not be verified. Keep the recovery data and download a recovery file.',
    IMPORT_INVALID:
      'This is not a valid list export or verified recovery file. The active library has not been replaced.',
    IMPORT_TOO_LARGE:
      'This import exceeds the transfer size limit. Use a compressed recovery archive (up to 64 MiB decoded JSON and 16 MiB compressed). The original has not been truncated or applied.',
    PARTIAL_SAVE_REQUIRES_ORIGINAL_INPUT:
      'Only part of this save was stored. Retry with the original editor input and request, or keep a recovery archive before investigating.',
    SYNC_EMPTY:
      'No previous browser-sync copy was found. Use a JSON export from the other installation instead.',
    SYNC_INVALID:
      'The browser sync copy could not be verified. It has not replaced the local library.',
    SYNC_READ_FAILED:
      'Browser sync could not be read. Check browser-account sync availability and try again.',
    MIGRATION_REQUIRED:
      'Migrate and verify your data in Settings before using these services.',
    JOB_REVISION_CONFLICT:
      'This job changed. Refresh its status before trying again.',
    JOB_INTEGRITY_FAILED:
      'This opening job could not be verified. Keep its recovery data; it will not be replayed automatically.',
    JOB_HEAD_MISSING:
      'An opening job has no verified progress pointer. Keep its recovery data instead of starting it again automatically.',
    JOB_NOT_FOUND:
      'That opening job is no longer available. Finished history may have expired; check current tabs before starting another batch.',
    DEFERRED_NOT_AVAILABLE:
      'This holding tab’s saved destination is unavailable. Keep any recovery archive and reopen the intended list from the opener.',
    OPEN_REQUEST_EXPIRED:
      'This older opening request has expired. Check your current tabs before choosing Open again to start a new request.',
    OPERATION_QUARANTINED:
      'That interrupted change was set aside. Start a new edit if you want to save it again.',
    QUARANTINE_INTEGRITY_FAILED:
      'An interrupted-change recovery receipt could not be verified. Keep a full recovery archive; no interrupted records will be removed.',
    PENDING_MUTATION:
      'A saved change is waiting for recovery. Review it in Settings before making another change.',
    MENU_REFRESH_FAILED:
      'Data may have been saved, but the context menu could not be refreshed. Check the saved setting and try again.',
    DATA_CONSENT_REQUIRED:
      'Firefox data consent for destinations and search terms is required before opening tabs.',
    PRIVATE_WINDOW_UNSUPPORTED:
      'The request belongs to a different regular or private workspace. Open the extension in the intended window.',
    TARGET_WINDOW_CHANGED:
      'The browser session changed. Resume explicitly in this window to choose a new target.',
    INTERRUPTED_CREATE:
      'Tab creation was interrupted before its result was recorded.',
    INTERRUPTED_ACTIVATION:
      'Final-tab activation was interrupted. It will not be repeated automatically.',
    TAB_CREATE_FAILED:
      'The browser did not confirm tab creation. Check existing tabs before retrying.',
    TAB_ACTIVATION_FAILED:
      'Tabs were created, but the final tab could not be activated.',
    RECOVERY_ALARM_FAILED:
      'Recovery alarms are unavailable. Opening is paused; Resume will try to establish recovery again.',
    JOB_REVIEW_REQUIRED:
      'Review the unconfirmed operation before resuming this job.',
    JOB_IN_FLIGHT:
      'A browser operation is already in progress. Wait for its result before retargeting.',
    OPERATION_ID_REUSED:
      'This request identifier belongs to another operation. Refresh before making a new request.',
    LIST_NAME_REQUIRED:
      'Enter a list name. The existing list has not been deleted.',
    LIST_NOT_FOUND:
      'That saved list no longer exists. Refresh the list selection.',
    INVALID_DATA_REFERENCE:
      'A setting refers to a missing list. Choose an existing list or an unset value.',
  };
  return Object.hasOwn(messages, code) ? messages[code]! : recoveryError(error);
}
