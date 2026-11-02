import { recoveryError } from '../recovery/labels';

export function serviceError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    CLIPBOARD_UNAVAILABLE:
      'Clipboard access was unavailable. Select and copy the displayed text, or use Download.',
    WORKSPACE_INTEGRITY_FAILED:
      'A draft, snapshot or transfer record could not be verified. Keep the recovery data and download a recovery file.',
    IMPORT_INVALID:
      'This is not a valid list export or verified recovery file. The active library has not been replaced.',
    IMPORT_TOO_LARGE:
      'This import is larger than 8 MiB. Keep the original file; it has not been truncated or applied.',
    SYNC_EMPTY:
      'No matching browser sync copy was found. Upload from the other installation first, or import a JSON file.',
    SYNC_INVALID:
      'The browser sync copy could not be verified. It has not replaced the local library.',
    SYNC_CHANGED:
      'The browser sync area changed after the preview. Inspect it again before uploading.',
    SYNC_TOO_LARGE:
      'This library exceeds the conservative 8 KB sync item limit. Use JSON export/import for this transfer. Your local library is kept.',
    SYNC_READ_FAILED:
      'Browser sync could not be read. Check browser-account sync availability and try again.',
    SYNC_WRITE_FAILED:
      'The browser did not confirm the sync write. Check the current copy before retrying; the previous copy is retained locally.',
    SYNC_VERIFICATION_FAILED:
      'The sync write did not match when read back. Inspect the copy again; local data and the previous sync backup are kept.',
    MIGRATION_REQUIRED:
      'Migrate and verify your data in Settings before using these services.',
    JOB_REVISION_CONFLICT:
      'This job changed. Refresh its status before trying again.',
    JOB_INTEGRITY_FAILED:
      'This opening job could not be verified. Keep its recovery data; it will not be replayed automatically.',
    JOB_HEAD_MISSING:
      'An opening job has no verified progress pointer. Keep its recovery data instead of starting it again automatically.',
    PENDING_MUTATION:
      'A saved change is waiting for recovery. Review it in Settings before making another change.',
    MENU_REFRESH_FAILED:
      'Data may have been saved, but the context menu could not be refreshed. Check the saved setting and try again.',
    DATA_CONSENT_REQUIRED:
      'Firefox data consent for destinations and search terms is required before opening tabs.',
    PRIVATE_WINDOW_UNSUPPORTED:
      'Private-window opening and capture need session-only handling and are unavailable in this preview. No private URLs were saved as a job.',
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
