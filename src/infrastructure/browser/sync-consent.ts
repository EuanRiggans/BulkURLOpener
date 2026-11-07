import { browser } from 'wxt/browser';
import { MigrationError } from '../../domain/storage/errors';

// Call directly from the upload click, before yielding the user gesture.
// The generated cross-browser types do not yet describe Firefox data consent.
export function requestSyncConsent(): Promise<void> {
  if (!import.meta.env.FIREFOX) return Promise.resolve();
  const permission = { data_collection: ['technicalAndInteraction'] };
  return browser.permissions
    .request(permission as Parameters<typeof browser.permissions.request>[0])
    .then((granted) => {
      if (!granted) throw new MigrationError('SYNC_CONSENT_REQUIRED');
    })
    .catch(() => {
      throw new MigrationError('SYNC_CONSENT_REQUIRED');
    });
}
