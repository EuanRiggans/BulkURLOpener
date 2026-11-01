import * as v from 'valibot';
import { MigrationError } from '../../domain/storage/errors';
import type { StorageCoordinator } from './coordinator';
import { isMigrationMessage, isRecoveryPage, requestSchema } from './protocol';

type Sender = { id?: string; url?: string; tab?: { incognito?: boolean } };
type Reply = { ok: true; value: unknown } | { ok: false; error: string };

export function createMigrationListener(
  storage: StorageCoordinator,
  identity: { id: string; root: string },
) {
  async function handle(message: unknown, sender: Sender): Promise<Reply> {
    try {
      if (!isRecoveryPage(sender, identity.id, identity.root))
        throw new MigrationError('UNAUTHORIZED_PAGE');
      if (sender.tab?.incognito)
        throw new MigrationError('PRIVATE_WINDOW_UNSUPPORTED');
      const request = v.parse(requestSchema, message);
      let value: unknown;
      switch (request.type) {
        case 'buo:migration/status':
          value = await storage.status();
          break;
        case 'buo:migration/prepare':
          value = await storage.prepare(request.document);
          break;
        case 'buo:migration/commit':
          value = await storage.commit(
            request.document,
            request,
            request.decisions,
          );
          break;
        case 'buo:migration/rollback':
          value = await storage.rollback(request.expected);
          break;
        case 'buo:migration/export':
          value = await storage.exportRecovery(request.document);
          break;
        case 'buo:migration/backup':
          value = await storage.backup(request.digest);
          break;
      }
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof MigrationError ? error.code : 'REQUEST_FAILED',
      };
    }
  }
  return (
    message: unknown,
    sender: Sender,
    sendResponse: (response: Reply) => void,
  ): true | undefined => {
    if (!isMigrationMessage(message)) return undefined;
    // Callback plus literal true works on the Chromium 120 floor as well as
    // Firefox. WXT's browser object does not polyfill Promise message listeners.
    void handle(message, sender)
      .then(sendResponse)
      .catch(() => {
        // The requesting document may have closed. Operations are retryable;
        // never log a response containing private data to diagnose a closed port.
      });
    return true;
  };
}
