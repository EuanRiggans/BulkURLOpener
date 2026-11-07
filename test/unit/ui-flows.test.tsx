// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Popup } from '../../src/ui/pages/Popup';
import { ListEditor } from '../../src/ui/ListEditor';
import { SettingsForm } from '../../src/ui/services/SettingsForm';
import { TransferReview } from '../../src/ui/services/TransferReview';
import { Tools } from '../../src/ui/pages/Tools';
import { DataPage } from '../../src/ui/pages/DataPage';
import { createMigrationListener } from '../../src/application/storage/messages';
import { WorkspaceService } from '../../src/application/workspace';
import { type SharedServices } from '../../src/application/services';
import { sharedSetup, sender, token } from './shared-support';
import { type Settings } from '../../src/domain/storage/schema';

const fake = vi.hoisted(() => ({
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
  create: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  requestPermission: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: fake.sendMessage,
      getURL: (page: string) => 'chrome-extension://synthetic-extension' + page,
      getManifest: () => ({ version: '2.0.0', manifest_version: 3 }),
    },
    tabs: { create: fake.create },
    permissions: { request: fake.requestPermission },
    windows: { getCurrent: () => Promise.resolve({ id: 1 }) },
    storage: {
      onChanged: {
        addListener: fake.addListener,
        removeListener: fake.removeListener,
      },
    },
  },
}));
let app: HTMLDivElement;
let services: SharedServices;
let from = 'popup.html';
let context: Awaited<ReturnType<typeof sharedSetup>>;
let pendingRequests = 0;
function unwrap(raw: unknown): unknown {
  return raw &&
    typeof raw === 'object' &&
    'type' in raw &&
    raw.type === 'buo:page' &&
    'request' in raw
    ? raw.request
    : raw;
}
beforeEach(async () => {
  vi.clearAllMocks();
  pendingRequests = 0;
  context = await sharedSetup();
  services = context.services;
  from = 'popup.html';
  history.replaceState(null, '', '/popup.html');
  app = document.createElement('div');
  document.body.append(app);
  fake.sendMessage.mockImplementation(async (message) => {
    pendingRequests++;
    try {
      message = unwrap(message);
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        String(message.type).startsWith('buo:migration/')
      )
        return await new Promise((resolve) => {
          createMigrationListener(context.storage, {
            id: sender(from).id,
            root: 'chrome-extension://synthetic-extension/',
          })(message, sender(from), resolve);
        });
      try {
        return {
          ok: true,
          value: await services.dispatch(message, sender(from)),
        };
      } catch (reason) {
        return {
          ok: false,
          error: reason instanceof Error ? reason.message : 'REQUEST_FAILED',
        };
      }
    } finally {
      pendingRequests--;
    }
  });
});
afterEach(async () => {
  await act(() => render(null, app));
  app.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function settle() {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(pendingRequests).toBe(0);
      expect(app.textContent).not.toMatch(
        /Working…|Loading preferences…|Saving…/,
      );
    },
    { timeout: 3000, interval: 10 },
  );
}
function node<T extends Element>(selector: string): T {
  const result = app.querySelector<T>(selector);
  if (!result) throw new Error('Missing element: ' + selector);
  return result;
}
function button(label: string): HTMLButtonElement {
  const result = [...app.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!result) throw new Error('Missing button: ' + label);
  return result;
}
async function click(label: string) {
  await act(() => button(label).click());
  await settle();
}
async function input(selector: string, value: string) {
  await act(() => {
    const field = node<HTMLInputElement | HTMLTextAreaElement>(selector);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}
async function select(selector: string, value: string) {
  await act(() => {
    const field = node<HTMLSelectElement>(selector);
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}
async function preference(patch: Partial<Settings>) {
  return context.storage.mutate({
    id: token(800),
    expectedHead: (await context.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch },
  });
}
async function createList() {
  await context.storage.mutate({
    id: token(1),
    expectedHead: (await context.storage.requireActiveData()).head,
    command: {
      kind: 'list.create',
      name: '<script>synthetic</script>',
      lines: ['https://list.example.test/?x=%2526', ''],
    },
  });
  return 'list-' + token(1);
}
const opens = () =>
  fake.sendMessage.mock.calls
    .map(([message]) => [unwrap(message)] as const)
    .filter(
      ([message]) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        String(message.type).startsWith('buo:service/open.'),
    );

describe('simple popup flows', () => {
  it('captures the initial tab scope without automatically opening or exposing inline list editors', async () => {
    await preference({
      autoOpenLists: true,
      currentlyOpenedTabsDisplay: 'allOpenedTabs',
    });
    await act(() => render(<Popup />, app));
    await settle();
    expect(node<HTMLTextAreaElement>('#entries').value).toBe(
      'https://captured.example.test/',
    );
    expect(context.browser.captures[0]!.scope).toBe('allOpenedTabs');
    expect(opens()).toHaveLength(0);
    expect(app.querySelector('#list-name')).toBeNull();
    expect(app.textContent).toContain('Pause automatic opening');
  });
  it('loads the previous typed draft including a cleared draft and exact query/newline content', async () => {
    const workspace = new WorkspaceService(context.storage);
    await workspace.saveDraft({
      client: token(3),
      sequence: 1,
      base: null,
      lines: ['café & %2526', ''],
    });
    await preference({ defaultListOpen: 'previous-input' });
    await act(() => render(<Popup />, app));
    await settle();
    expect(node<HTMLTextAreaElement>('#entries').value).toBe('café & %2526\n');
    await click('Clear');
    expect((await workspace.read()).draft.lines).toEqual(['']);
    expect(document.activeElement).toBe(node('#entries'));
    await input('#entries', 'https://example.test/?a=%26\n\n');
    expect((await workspace.read()).draft.lines).toEqual([
      'https://example.test/?a=%26',
      '',
      '',
    ]);
  });
  it('keeps selection load/open preferences independent and applies the temporary auto-open override', async () => {
    const id = await createList();
    await preference({ autoOpenLists: true, autoLoadIntoTextarea: false });
    await act(() => render(<Popup />, app));
    await settle();
    await act(() => node<HTMLInputElement>('.check-label input').click());
    await settle();
    await select('#saved-lists', id);
    expect(opens()).toHaveLength(0);
    expect(node<HTMLTextAreaElement>('#entries').value).toContain('captured');
    await click('Load');
    expect(node<HTMLTextAreaElement>('#entries').value).toContain(
      'list.example.test',
    );
    await select('#saved-lists', '');
    await act(() => node<HTMLInputElement>('.check-label input').click());
    await settle();
    await select('#saved-lists', id);
    expect(opens()).toHaveLength(1);
    expect(app.querySelector('script')).toBeNull();
  });
  it('freezes the new-list handoff on its own page and keeps URLs/names out of navigation parameters', async () => {
    await act(() => render(<Popup />, app));
    await settle();
    await input('#entries', 'https://handoff.example.test/?q=%2526\n');
    await click('New');
    const call = fake.create.mock.calls[0] as unknown[] | undefined;
    expect(call).toBeDefined();
    const value = call![0] as { url: string };
    const destination = new URL(value.url);
    expect(destination.pathname).toBe('/new-list.html');
    expect(value.url).not.toContain('handoff.example');
    const workspace = new WorkspaceService(context.storage);
    expect(
      await workspace.draft(destination.searchParams.get('draft')!),
    ).toEqual(['https://handoff.example.test/?q=%2526', '']);
  });
  it('retries an unacknowledged opening using the same request ID', async () => {
    await act(() => render(<Popup />, app));
    await settle();
    const dispatch = fake.sendMessage.getMockImplementation()!;
    let interrupted = false;
    fake.sendMessage.mockImplementation(async (message) => {
      const reply = await dispatch(message);
      message = unwrap(message);
      if (
        !interrupted &&
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'buo:service/open.lines'
      ) {
        interrupted = true;
        throw new Error('Closed message port');
      }
      return reply;
    });
    await click('Open links');
    await click('Open links');
    const requests = opens().map(([message]) => message as { id: string });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.id).toBe(requests[1]!.id);
    expect(await context.opening.list()).toHaveLength(1);
  });
});

describe('separate editor and settings forms', () => {
  it('retains the reviewed Firefox upload after consent refusal and uploads only after a later grant', async () => {
    vi.stubEnv('FIREFOX', 'true');
    fake.requestPermission
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    from = 'data.html';
    history.replaceState(null, '', '/data.html');
    await act(() => render(<DataPage />, app));
    await settle();
    const before = structuredClone(context.port.sync);
    await click('Review upload');
    const localBeforeDecline = structuredClone(context.port.local);
    await act(() =>
      node<HTMLInputElement>('.transfer-review input[type="checkbox"]').click(),
    );
    await settle();
    await click('Upload reviewed copy');
    expect(context.port.sync).toEqual(before);
    expect(context.port.local).toEqual(localBeforeDecline);
    expect(context.port.syncWrites).toBe(0);
    expect(app.textContent).toContain('optional settings data');
    expect(button('Upload reviewed copy').disabled).toBe(false);
    await click('Upload reviewed copy');
    expect(fake.requestPermission).toHaveBeenCalledWith({
      data_collection: ['technicalAndInteraction'],
    });
    expect(context.port.syncWrites).toBe(1);
    expect(app.textContent).toContain('Sync write verified locally.');
  });
  it('prepares copyable exports and applies only an acknowledged, reviewed import from the data page', async () => {
    from = 'data.html';
    history.replaceState(null, '', '/data.html');
    await act(() => render(<DataPage />, app));
    await settle();
    await click('Prepare export');
    const raw = JSON.parse(node<HTMLTextAreaElement>('#export-json').value) as {
      lists: { id: string; name: string; lines: string[] }[];
    };
    raw.lists.push({
      id: 'list-' + token(50),
      name: 'Imported example',
      lines: ['https://imported.example.test/?x=%2526'],
    });
    await input('#import-json', JSON.stringify(raw));
    await click('Inspect pasted JSON');
    expect(document.activeElement?.id).toBe('transfer-title');
    expect((await context.storage.requireActiveData()).data.lists).toHaveLength(
      0,
    );
    await click('Cancel review');
    expect(app.querySelector('#transfer-title')).toBeNull();
    await click('Inspect pasted JSON');
    expect(button('Replace lists and settings').disabled).toBe(true);
    await act(() =>
      node<HTMLInputElement>('.transfer-review input[type="checkbox"]').click(),
    );
    await settle();
    await click('Replace lists and settings');
    expect(
      (await context.storage.requireActiveData()).data.lists[0]!.name,
    ).toBe('Imported example');
    expect(context.browser.created).toEqual([]);
    expect(app.textContent).toContain('Reviewed lists and settings restored.');
  });
  it('saves a one-line edit without changing its identity and keeps stale edits visible', async () => {
    const id = await createList();
    from = 'edit-list.html';
    history.replaceState(null, '', '/edit-list.html?id=' + id);
    await act(() => render(<ListEditor mode="edit" />, app));
    await settle();
    await input('#list-name', 'Changed');
    await input('#list-entries', 'https://single.example.test/');
    await act(() => {
      node<HTMLFormElement>('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(
      (await context.storage.requireActiveData()).data.lists[0],
    ).toMatchObject({
      id,
      name: 'Changed',
      lines: ['https://single.example.test/'],
    });
    await input('#list-entries', 'Unsaved correction');
    await preference({ nightMode: true });
    await act(() => {
      node<HTMLFormElement>('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(node<HTMLTextAreaElement>('#list-entries').value).toBe(
      'Unsaved correction',
    );
    expect(button('Save list').disabled).toBe(true);
    await click('Keep my entries and refresh saved revision');
    expect(node<HTMLTextAreaElement>('#list-entries').value).toBe(
      'Unsaved correction',
    );
    expect(button('Save list').disabled).toBe(false);
  });
  it('renders all 17 preferences, saves fractional delays, and autosaves valid choices', async () => {
    from = 'options.html';
    await act(() => render(<SettingsForm />, app));
    await settle();
    expect(app.querySelectorAll('[id^="setting-"]')).toHaveLength(17);
    await input('#setting-tabCreationDelay', '0.125');
    await act(() => {
      node<HTMLFormElement>('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(
      (await context.storage.requireActiveData()).data.settings
        .tabCreationDelay,
    ).toBe(0.125);
    await act(() => node<HTMLInputElement>('#setting-nightMode').click());
    await settle();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    expect(
      (await context.storage.requireActiveData()).data.settings.nightMode,
    ).toBe(true);
    expect(app.textContent).toContain('Settings saved.');
  });
  it('blocks replacement until the user acknowledges it and keeps the same operation ID on retry', async () => {
    const workspace = new WorkspaceService(context.storage);
    const review = await workspace.preview(
      await workspace.export(false),
      'paste',
    );
    const apply = vi.fn();
    await act(() =>
      render(
        <TransferReview
          review={review}
          busy={false}
          apply={apply}
          cancel={() => undefined}
        />,
        app,
      ),
    );
    expect(button('Replace lists and settings').disabled).toBe(true);
    await act(() => node<HTMLInputElement>('input[type="checkbox"]').click());
    await settle();
    await click('Replace lists and settings');
    await click('Replace lists and settings');
    expect(apply.mock.calls[0]?.[0] as unknown).toBe(
      apply.mock.calls[1]?.[0] as unknown,
    );
  });
  it('extracts multiple URLs on a line and reverses blank lines without rendering input as HTML', async () => {
    from = 'tools.html';
    history.replaceState(null, '', '/tools.html');
    await act(() => render(<Tools />, app));
    await input(
      '#tool-input',
      '<b>https://one.example.test/</b> and https://two.example.test/',
    );
    expect(node<HTMLTextAreaElement>('#tool-output').value).toBe(
      'https://one.example.test/\nhttps://two.example.test/',
    );
    expect(app.querySelector('b')).toBeNull();
    await select('#tool-mode', 'reverse');
    await input('#tool-input', 'one\n\nthree');
    expect(node<HTMLTextAreaElement>('#tool-output').value).toBe(
      'three\n\none',
    );
  });
});
