import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { extensionRequest } from '../infrastructure/browser/client';
import { appearanceSchema, contextSchema } from '../domain/workspace-schema';
import { scopedKeys } from '../shared/storage-events';
import './styles.css';

function Appearance({ children }: { children: ComponentChildren }) {
  const [privateMode, setPrivateMode] = useState(false);
  useEffect(() => {
    let alive = true;
    async function read() {
      try {
        const context = await extensionRequest(
          { type: 'buo:service/context.read' },
          contextSchema,
        );
        if (alive) setPrivateMode(context.private);
        if (location.pathname === '/deferred.html') return;
        const settings = await extensionRequest(
          { type: 'buo:service/appearance.read' },
          appearanceSchema,
        );
        if (!alive) return;
        const root = document.documentElement;
        root.dataset.mode = settings.nightMode ? 'dark' : 'light';
        root.dataset.theme = settings.customTheme;
        root.dataset.buttons = settings.buttonLook;
      } catch {
        /* Migration/recovery remains usable before preferences are ready. */
      }
    }
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (scopedKeys(changes, area).includes('buo:v2:head')) void read();
    };
    browser.storage.onChanged.addListener(changed);
    void read();
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  return (
    <>
      {privateMode && (
        <aside
          class={
            location.pathname === '/popup.html'
              ? 'session-notice popup-session-notice'
              : 'session-notice'
          }
          aria-label="Private session"
        >
          <strong>Private session.</strong> Lists, edits and jobs here are
          temporary and clear when the last private window closes. Sync is
          unavailable.
        </aside>
      )}
      {children}
    </>
  );
}
export function mount(content: ComponentChildren): void {
  const root = document.getElementById('app');
  if (!root)
    throw new Error('The extension page is missing its application root.');
  render(<Appearance>{content}</Appearance>, root);
}
