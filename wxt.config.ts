import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  imports: false,
  manifest: ({ browser }) => ({
    name: 'Bulk URL Opener',
    description: 'Open URLs in batches and manage saved lists.',
    action: { default_title: 'Bulk URL Opener' },
    permissions: ['storage'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      64: 'icon/64.png',
      128: 'icon/128.png',
    },
    commands: {
      _execute_action: { suggested_key: { default: 'Ctrl+Shift+U' } },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none';",
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '{c5b32a48-5514-4a46-81f2-075ebf3cbc29}',
              strict_min_version: '142.0',
              // Review when features that transmit data (search, sync) are introduced.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '120' }),
  }),
  vite: () => ({
    plugins: [preact({ devToolsEnabled: false })],
    build: { sourcemap: true },
  }),
});
