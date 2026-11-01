import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createMigrationListener } from '../application/storage/messages';
import { createStorageCoordinator } from '../infrastructure/browser/storage';

export default defineBackground(() => {
  const storage = createStorageCoordinator();
  // Register synchronously. Startup performs no migration/default initialization.
  browser.runtime.onMessage.addListener(
    createMigrationListener(storage, {
      id: browser.runtime.id,
      root: browser.runtime.getURL('/'),
    }),
  );
});
