import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { extensionRequest } from '../infrastructure/browser/client';
import { appearanceSchema } from '../domain/workspace-schema';
import './styles.css';

function Appearance({ children }: { children: ComponentChildren }) {
  useEffect(() => {
    let alive = true;
    async function read() {
      if (location.pathname === '/deferred.html') return;
      try {
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
      if (area === 'local' && Object.hasOwn(changes, 'buo:v2:head'))
        void read();
    };
    browser.storage.onChanged.addListener(changed);
    void read();
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  return <>{children}</>;
}
export function mount(content: ComponentChildren): void {
  const root = document.getElementById('app');
  if (!root)
    throw new Error('The extension page is missing its application root.');
  render(<Appearance>{content}</Appearance>, root);
}
