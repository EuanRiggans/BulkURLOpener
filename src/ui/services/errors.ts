import { recoveryError } from '../recovery/labels';

export function serviceError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
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
