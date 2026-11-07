import * as v from 'valibot';
import { MigrationError } from '../../domain/storage/errors';
import type { StorageCoordinator } from './coordinator';
import { isMigrationMessage, isRecoveryPage, requestSchema } from './protocol';

type Sender = { id?: string; url?: string; tab?: { incognito?: boolean } };
type Reply = { ok: true; value: unknown } | { ok: false; error: string };

export function createMigrationListener(
  storage: StorageCoordinator,
  identity: { id: string; root: string },
  privateMode = false,
) {
  async function handle(message: unknown, sender: Sender): Promise<Reply> {
    try {
      if (!isRecoveryPage(sender, identity.id, identity.root))
        throw new MigrationError('UNAUTHORIZED_PAGE');
      if (Boolean(sender.tab?.incognito) !== privateMode)
        throw new MigrationError('PRIVATE_WINDOW_UNSUPPORTED');
      const request = v.parse(requestSchema, message);
      if (
        [
          'buo:migration/recovery-available',
          'buo:migration/recovery-preview',
          'buo:migration/recovery-activate',
        ].includes(request.type) &&
        new URL(sender.url!).pathname !== '/data.html'
      )
        throw new MigrationError('UNAUTHORIZED_PAGE');
      if (
        privateMode &&
        [
          'buo:migration/prepare',
          'buo:migration/commit',
          'buo:migration/rollback',
          'buo:migration/compact',
        ].includes(request.type)
      )
        throw new MigrationError('PRIVATE_MIGRATION_UNAVAILABLE');
      let value: unknown;
      switch (request.type) {
        case 'buo:migration/status':
          value = await storage.status();
          break;
        case 'buo:migration/recovery-available':
          value = await storage.recoveryAvailable();
          break;
        case 'buo:migration/recovery-preview':
          value = await storage.previewRecovery(
            privateMode ? {} : request.document,
            request.archive,
            request.source,
          );
          break;
        case 'buo:migration/recovery-activate':
          value = await storage.activateRecovery(
            privateMode ? {} : request.document,
            request.input,
          );
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
          value = await storage.exportRecovery(
            privateMode ? {} : request.document,
          );
          break;
        case 'buo:migration/export-archive':
          value = await storage.exportArchive(
            privateMode ? {} : request.document,
          );
          break;
        case 'buo:migration/storage-info':
          value = await storage.storageInfo();
          break;
        case 'buo:migration/recovery-copies':
          value = await storage.recoveryCopies();
          break;
        case 'buo:migration/export-copy':
          value = await storage.exportCopy(request.digest);
          break;
        case 'buo:migration/compact':
          value = await storage.compactArchive(
            request.document,
            request.archive,
          );
          break;
        case 'buo:migration/pending':
          value = await storage.pendingMutations();
          break;
        case 'buo:migration/quarantine':
          value = await storage.quarantineMutation(
            privateMode ? {} : request.document,
            request.archive,
            request.stateDigest,
            request.expectedHead,
          );
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
