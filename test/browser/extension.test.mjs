import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';

const target = process.env.BUO_TEST_BROWSER;
assert(
  ['chrome', 'firefox'].includes(target),
  'Set BUO_TEST_BROWSER to chrome or firefox.',
);
const label = process.env.BUO_TEST_LABEL || target;
assert(/^[a-z-]+$/.test(label), 'Use a simple browser evidence label.');
const evidence = resolve('test-results', label);
const addonId = '{c5b32a48-5514-4a46-81f2-075ebf3cbc29}';
const uuid = '11111111-2222-4333-8444-555555555555';
const id = () => randomBytes(32).toString('hex');
const axeSource = await readFile(
  resolve('node_modules/axe-core/axe.min.js'),
  'utf8',
);
let driver, root, server, destination;
let normalRootHandle;
const requests = [];
const report = {
  browser: target,
  source: process.env.GITHUB_SHA || 'local',
  assertions: [],
};

before(
  async () => {
    await mkdir(evidence, { recursive: true });
    // An unmanaged disposable browser is required. Never override enterprise
    // installation policy to make an extension test pass in a managed workspace.
    for (const path of [
      '/etc/chromium/policies/managed/extensions.json',
      '/etc/opt/chrome/policies/managed/extensions.json',
    ]) {
      if (existsSync(path)) {
        const policy = JSON.parse(await readFile(path, 'utf8'));
        assert(
          !policy.ExtensionInstallBlocklist?.includes('*'),
          'Managed browser blocks extensions; run this suite in the browser CI job.',
        );
      }
    }
    server = createServer((_request, response) => {
      requests.push(_request.url);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><html lang="en"><title>Synthetic destination</title><h1>Synthetic destination</h1></html>',
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    destination = 'http://127.0.0.1:' + server.address().port;
    const builder = new Builder().forBrowser(target);
    if (target === 'chrome') {
      const options = new chrome.Options({
        'goog:chromeOptions': { enableExtensionTargets: true },
      }).addArguments(
        '--headless=new',
        '--window-size=1280,960',
        '--load-extension=' + resolve('.output/chrome-mv3'),
      );
      if (process.env.BUO_BROWSER_BIN)
        options.setChromeBinaryPath(process.env.BUO_BROWSER_BIN);
      builder.setChromeOptions(options);
      if (process.env.BUO_DRIVER_BIN)
        builder.setChromeService(
          new chrome.ServiceBuilder(process.env.BUO_DRIVER_BIN)
            .enableVerboseLogging()
            .loggingTo(resolve(evidence, 'driver.log')),
        );
      driver = await builder.build();
      await driver.get('chrome://extensions');
      await driver.executeScript(
        'chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode: true});',
      );
      await driver.wait(
        () =>
          driver.executeAsyncScript(function (done) {
            chrome.developerPrivate.getProfileConfiguration((configuration) =>
              done(configuration.inDeveloperMode),
            );
          }),
        15_000,
        'A fresh unpacked test profile must enable Developer mode.',
      );
      await driver.wait(
        async () => {
          root = await driver.executeScript(
            `return Array.from(document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-item-list')?.shadowRoot?.querySelectorAll('extensions-item') || []).map(x => x.data).find(x => x.name === 'Bulk URL Opener')?.id;`,
          );
          return Boolean(root);
        },
        15_000,
        'Unpacked extension must load.',
      );
      const granted = await driver.executeAsyncScript(function (
        extensionId,
        done,
      ) {
        chrome.developerPrivate.updateExtensionConfiguration(
          { extensionId, incognitoAccess: true },
          () => done({ error: chrome.runtime?.lastError?.message ?? null }),
        );
      }, root);
      assert.equal(granted.error, null);
      await driver.wait(
        () =>
          driver.executeAsyncScript(function (extensionId, done) {
            chrome.developerPrivate.getExtensionsInfo(
              { includeDisabled: true, includeTerminated: true },
              (items) =>
                done(
                  items.some(
                    (item) =>
                      item.id === extensionId &&
                      item.state ===
                        chrome.developerPrivate.ExtensionState.ENABLED,
                  ),
                ),
            );
          }, root),
        20_000,
        'The extension must stay enabled after its private-access reload.',
      );
      root = 'chrome-extension://' + root + '/';
    } else {
      const options = new firefox.Options()
        .addArguments('-headless')
        .setPreference(
          'extensions.webextensions.uuids',
          JSON.stringify({ [addonId]: uuid }),
        );
      if (process.env.BUO_BROWSER_BIN)
        options.setBinary(process.env.BUO_BROWSER_BIN);
      builder.setFirefoxOptions(options);
      if (process.env.BUO_DRIVER_BIN)
        builder.setFirefoxService(
          new firefox.ServiceBuilder(process.env.BUO_DRIVER_BIN).addArguments(
            '--allow-system-access',
          ),
        );
      driver = await builder.build();
      assert.equal(
        await driver.installAddon(resolve('.output/firefox-mv3'), true),
        addonId,
      );
      await driver.setContext(firefox.Context.CHROME);
      const granted = await driver.executeAsyncScript(
        `const id = arguments[0], done = arguments[1]; (async () => { const {ExtensionPermissions} = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs'); await ExtensionPermissions.add(id, {permissions: ['internal:privateBrowsingAllowed'], origins: []}); const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs'); await (await AddonManager.getAddonByID(id)).reload(); return true; })().then(() => done({ok: true}), error => done({error: String(error)}));`,
        addonId,
      );
      assert(granted.ok, granted.error);
      root = await driver.executeScript(
        'return WebExtensionPolicy.getByID(arguments[0]).getURL("/");',
        addonId,
      );
      await driver.setContext(firefox.Context.CONTENT);
    }
    await driver.manage().setTimeouts({ script: 30_000, pageLoad: 30_000 });
    const capabilities = await driver.getCapabilities();
    report.version = capabilities.get('browserVersion');
    report.platform = capabilities.get('platformName');
    // Changing Chrome's private-access grant reloads the extension. A completed
    // WebUI callback can precede that reload; wait for the actual extension API
    // rather than mistaking the browser's temporary error-page h1 for readiness.
    await driver.wait(async () => {
      await navigate(root + 'options.html');
      return driver.executeScript(
        'return Boolean((globalThis.browser || globalThis.chrome)?.runtime?.id);',
      );
    }, 20_000);
    await driver.wait(until.elementLocated(By.css('h1')), 15_000);
    assert.equal(
      await native('return await api.extension.isAllowedIncognitoAccess();'),
      true,
      'Private access must be an actual browser grant in this disposable profile.',
    );
    report.privateGrant = true;
    normalRootHandle = await driver.getWindowHandle();
  },
  { timeout: 120_000 },
);

after(async () => {
  if (driver) {
    try {
      await writeFile(
        resolve(evidence, 'final.png'),
        await driver.takeScreenshot(),
        'base64',
      );
    } catch {
      /* Best effort after a startup failure. */
    }
    await driver.quit();
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await writeFile(
    resolve(evidence, 'summary.json'),
    JSON.stringify(report, null, 2),
  );
});
afterEach(async (context) => {
  if (!driver || !normalRootHandle || !context.name.startsWith('private pages'))
    return;
  await driver.switchTo().window(normalRootHandle);
  await page('popup.html');
  if (target === 'chrome') {
    const { targetInfos } = await driver.sendAndGetDevToolsCommand(
      'Target.getTargets',
      {},
    );
    const normal = targetInfos.find(
      (item) => item.targetId === normalRootHandle.replace(/^CDwindow-/, ''),
    );
    assert(normal, 'The regular test tab must still exist.');
    for (const item of targetInfos)
      if (
        item.type === 'page' &&
        item.browserContextId !== normal.browserContextId
      )
        await driver.sendDevToolsCommand('Target.closeTarget', {
          targetId: item.targetId,
        });
    return;
  }
  await native(
    'for (const window of await api.windows.getAll()) if (window.incognito) await api.windows.remove(window.id); return true;',
  );
});

async function rpc(request) {
  const response = await driver.executeAsyncScript(function (input, done) {
    const api = globalThis.browser || globalThis.chrome;
    api.runtime
      .sendMessage(input)
      .then(done, (error) => done({ ok: false, error: String(error) }));
  }, request);
  assert(response?.ok, JSON.stringify(response));
  return response.value;
}
async function native(body, ...args) {
  const result = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1]; const page = window.wrappedJSObject || window; const api = page.browser || page.chrome || globalThis.browser || globalThis.chrome; (async () => { ${body} })().then(value => done({ok: true, value}), error => done({ok: false, error: String(error)}));`,
    ...args,
  );
  assert(result.ok, result.error);
  return result.value;
}
async function settings(patch) {
  await page('options.html');
  const active = await rpc({ type: 'buo:service/library.read' });
  return rpc({
    type: 'buo:service/library.mutate',
    input: {
      id: id(),
      expectedHead: active.head,
      command: { kind: 'settings.update', patch },
    },
  });
}
async function audit(name) {
  const result = await driver.executeAsyncScript(
    axeSource +
      '\nconst done = arguments[arguments.length - 1]; axe.run(document, {runOnly: {type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]}}).then(result => done({violations: result.violations, incomplete: result.incomplete.map(item => ({id: item.id, impact: item.impact}))}), error => done({error: String(error)}));',
  );
  await writeFile(
    resolve(evidence, 'axe-' + name + '.json'),
    JSON.stringify(result, null, 2),
  );
  assert(!result.error, result.error);
  assert.deepEqual(
    result.violations,
    [],
    'Accessibility violations on ' +
      name +
      ': ' +
      result.violations.map((item) => item.id).join(', '),
  );
}
async function page(path) {
  await navigate(root + path);
  await driver.wait(until.elementLocated(By.css('h1')), 15_000);
  await driver.wait(
    async () =>
      !(await driver.executeScript(
        'return Boolean(document.querySelector("[aria-busy=true]"));',
      )),
    15_000,
  );
}
async function navigate(url) {
  if (target === 'chrome') return driver.get(url);
  await driver.switchTo().window(await driver.getWindowHandle());
  await driver.setContext(firefox.Context.CHROME);
  try {
    const previous = await driver.executeScript(
      'return gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;',
    );
    await driver.executeScript(
      'gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});',
      url,
    );
    await driver.wait(
      async () =>
        (await driver.executeScript(
          'return gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;',
        )) !== previous,
      15_000,
    );
  } finally {
    await driver.setContext(firefox.Context.CONTENT);
  }
  await driver.wait(until.urlIs(url), 15_000);
  await driver.wait(
    async () =>
      await driver.executeScript(
        'return document.readyState === "complete" && Boolean(document.querySelector("h1"));',
      ),
    15_000,
  );
}
async function clickText(text) {
  await driver
    .findElement(By.xpath(`//button[normalize-space(.)='${text}']`))
    .click();
}
async function findPage(prefix, privateMode, windowId) {
  for (const handle of await driver.getAllWindowHandles()) {
    await driver.switchTo().window(handle);
    if (!(await driver.getCurrentUrl()).startsWith(root + prefix)) continue;
    if (
      (await rpc({ type: 'buo:service/context.read' })).private ===
        privateMode &&
      (windowId === undefined ||
        (await native('return (await api.tabs.getCurrent()).windowId;')) ===
          windowId)
    )
      return handle;
  }
  return null;
}
async function stopBackground() {
  if (target === 'chrome') {
    const before = await driver.sendAndGetDevToolsCommand(
      'Target.getTargets',
      {},
    );
    const handle = (await driver.getWindowHandle()).replace(/^CDwindow-/, '');
    const context = before.targetInfos.find(
      (item) => item.targetId === handle,
    )?.browserContextId;
    const worker = before.targetInfos.find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith(root) &&
        item.browserContextId === context,
    );
    assert(worker, 'The extension worker must be running before termination.');
    await driver.sendDevToolsCommand('ServiceWorker.enable', {});
    await driver.sendDevToolsCommand('ServiceWorker.stopAllWorkers', {});
    await driver.wait(
      async () =>
        !(
          await driver.sendAndGetDevToolsCommand('Target.getTargets', {})
        ).targetInfos.some((item) => item.targetId === worker.targetId),
      15_000,
    );
    return { kind: 'service-worker', previous: worker.targetId };
  }
  await driver.setContext(firefox.Context.CHROME);
  try {
    const result = await driver.executeAsyncScript(
      `const id = arguments[0], done = arguments[1]; const extension = WebExtensionPolicy.getByID(id).extension; extension.terminateBackground({ignoreDevToolsAttached: true, disableResetIdleForTest: true}).then(() => done({state: extension.backgroundState}), error => done({error: String(error)}));`,
      addonId,
    );
    assert.equal(result.state, 'stopped', JSON.stringify(result));
    return { kind: 'event-background', previous: 'running' };
  } finally {
    await driver.setContext(firefox.Context.CONTENT);
  }
}

test(
  'MV3 background migrates, saves a single-line list and preserves it after navigation',
  { timeout: 90_000 },
  async () => {
    const review = await rpc({ type: 'buo:migration/prepare', document: {} });
    const decisions = {
      acknowledgeIssues: true,
      preferences: Object.fromEntries(
        review.plan.preferences.map((item) => [item.key, item.options[0].id]),
      ),
      historical: {},
    };
    const ready = await rpc({
      type: 'buo:migration/commit',
      document: {},
      backupDigest: review.backupDigest,
      baseHead: review.baseHead,
      decisions,
    });
    assert.equal(ready.status, 'ready');
    await page('new-list.html');
    await driver.wait(
      until.elementIsEnabled(await driver.findElement(By.id('list-name'))),
      15_000,
    );
    await driver
      .findElement(By.id('list-name'))
      .sendKeys('Synthetic browser list');
    await driver
      .findElement(By.id('list-entries'))
      .sendKeys(destination + '/one?x=%2526');
    await clickText('Save list');
    await driver.wait(until.urlContains('edit-list.html'), 15_000);
    await page('popup.html');
    await driver.wait(
      until.elementIsEnabled(await driver.findElement(By.id('entries'))),
      15_000,
    );
    const workspace = await rpc({ type: 'buo:service/workspace.read' });
    assert.equal(workspace.data.lists.length, 1);
    assert.deepEqual(workspace.data.lists[0].lines, [
      destination + '/one?x=%2526',
    ]);
    report.assertions.push(
      'migration, separate one-line editor and persisted navigation',
    );
  },
);

test(
  'popup draft is acknowledged, survives document closure and retains trailing blank lines',
  { timeout: 30_000 },
  async () => {
    const area = await driver.findElement(By.id('entries'));
    await area.clear();
    await area.sendKeys(destination + '/draft?x=%2526', Key.ENTER, Key.ENTER);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/workspace.read' })).draft.lines?.join(
          '\n',
        ) ===
        destination + '/draft?x=%2526\n\n',
      15_000,
    );
    await page('help.html');
    await page('popup.html');
    assert.deepEqual(
      (await rpc({ type: 'buo:service/workspace.read' })).draft.lines,
      [destination + '/draft?x=%2526', '', ''],
    );
    report.assertions.push('draft persistence and exact encoded input');
  },
);

test(
  'actual browser creates a delayed batch, records completion and capture omits extension pages',
  { timeout: 45_000 },
  async () => {
    await page('options.html');
    const active = await rpc({ type: 'buo:service/library.read' });
    await rpc({
      type: 'buo:service/library.mutate',
      input: {
        id: id(),
        expectedHead: active.head,
        command: {
          kind: 'settings.update',
          patch: { tabCreationDelay: 0.125, newTabsActive: false },
        },
      },
    });
    await page('popup.html');
    const current = await rpc({ type: 'buo:service/library.read' });
    const job = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      lines: [destination + '/batch-one', destination + '/batch-two'],
      expectedHead: current.head,
    });
    await page('opening.html?job=' + job.plan.id);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/jobs.list' })).find(
          (item) => item.plan.id === job.plan.id,
        )?.run.status === 'completed',
      30_000,
    );
    const result = (await rpc({ type: 'buo:service/jobs.list' })).find(
      (item) => item.plan.id === job.plan.id,
    );
    assert.equal(result.receipts.length, 2);
    assert(result.receipts.every((item) => item.kind === 'opened'));
    await page('popup.html');
    const captured = await rpc({ type: 'buo:service/capture' });
    assert(captured.lines.some((url) => url === destination + '/batch-one'));
    assert(captured.lines.every((url) => !url.startsWith(root)));
    report.assertions.push('real delayed tab creation, receipts and capture');
  },
);

test(
  'keyboard opening, action order and clear work without a mouse',
  { timeout: 30_000 },
  async () => {
    await page('popup.html');
    await driver.wait(
      async () =>
        (await driver.executeScript('return document.activeElement.id;')) ===
        'entries',
      15_000,
    );
    const area = await driver.findElement(By.id('entries'));
    await area.clear();
    await area.sendKeys(destination + '/keyboard', Key.TAB);
    assert.equal(
      await driver.executeScript(
        'return document.activeElement.textContent.trim();',
      ),
      'Open links',
    );
    await driver.actions().sendKeys(Key.TAB).perform();
    assert.equal(
      await driver.executeScript(
        'return document.activeElement.textContent.trim();',
      ),
      'Get current tabs',
    );
    await driver.actions().sendKeys(Key.TAB, Key.ENTER).perform();
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/workspace.read' })).draft.lines?.join(
          '\n',
        ) === '',
      15_000,
    );
    assert.equal(
      await driver.executeScript('return document.activeElement.id;'),
      'entries',
    );
    report.assertions.push('keyboard focus, sequential controls and clear');
  },
);

test(
  'all bundled page layouts pass WCAG automation and narrow reflow',
  { timeout: 120_000 },
  async () => {
    const active = await rpc({ type: 'buo:service/library.read' });
    const pages = [
      'popup.html',
      'options.html',
      'new-list.html',
      'edit-list.html?id=' + active.data.lists[0].id,
      'data.html',
      'tools.html',
      'help.html',
      'opening.html',
      'deferred.html',
    ];
    await driver.manage().window().setRect({ width: 1280, height: 960 });
    for (const route of pages) {
      await page(route);
      const name = route.split(/[.?]/)[0];
      await native(
        'const tab = await api.tabs.getCurrent(); await api.tabs.setZoom(tab.id, 4); return true;',
      );
      await driver.wait(
        async () => (await driver.executeScript('return innerWidth;')) <= 340,
        10_000,
      );
      await audit(name + '-zoom-400');
      const size = await driver.executeScript(
        'return {width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth};',
      );
      assert(
        size.scroll <= size.width + 1,
        name + ' must reflow at 320 CSS px: ' + JSON.stringify(size),
      );
      await writeFile(
        resolve(evidence, name + '-narrow.png'),
        await driver.takeScreenshot(),
        'base64',
      );
      await native(
        'const tab = await api.tabs.getCurrent(); await api.tabs.setZoom(tab.id, 1); return true;',
      );
    }
    await driver.manage().window().setRect({ width: 1280, height: 960 });
    await page('popup.html');
    await native(
      'const tab = await api.tabs.getCurrent(); await api.tabs.setZoom(tab.id, 2); return true;',
    );
    await driver.wait(
      async () =>
        (await native(
          'const tab = await api.tabs.getCurrent(); return api.tabs.getZoom(tab.id);',
        )) === 2,
      10_000,
    );
    await audit('popup-zoom-200');
    await writeFile(
      resolve(evidence, 'popup-zoom-200.png'),
      await driver.takeScreenshot(),
      'base64',
    );
    await native(
      'const tab = await api.tabs.getCurrent(); await api.tabs.setZoom(tab.id, 1); return true;',
    );
    report.assertions.push(
      'nine page states: WCAG rules and actual 400% reflow; popup at 200% zoom',
    );
  },
);

test(
  'appearance presets retain readable controls in all light/dark/button combinations',
  { timeout: 120_000 },
  async () => {
    for (const theme of ['defaultBootstrap', 'fluentDesignBootstrap']) {
      for (const dark of [false, true]) {
        for (const buttons of [
          'alwaysOutline',
          'alwaysFilled',
          'filledNight',
          'filledLight',
        ]) {
          await settings({
            customTheme: theme,
            nightMode: dark,
            buttonLook: buttons,
          });
          await page('popup.html');
          await driver.wait(
            async () =>
              (await driver.executeScript(
                'return [document.documentElement.dataset.theme, document.documentElement.dataset.mode, document.documentElement.dataset.buttons].join("|");',
              )) === [theme, dark ? 'dark' : 'light', buttons].join('|'),
            15_000,
          );
          await audit('theme-' + theme + '-' + dark + '-' + buttons);
        }
      }
    }
    await settings({
      customTheme: 'defaultBootstrap',
      nightMode: false,
      buttonLook: 'alwaysOutline',
    });
    report.assertions.push('16 actual appearance/contrast states');
  },
);

test(
  'private pages, drafts, edits, jobs and recovery stay session-only across background restart',
  { timeout: 180_000 },
  async () => {
    await settings({ currentlyOpenedTabsDisplay: 'allOpenedTabs' });
    await page('popup.html');
    const normalHandle = await driver.getWindowHandle();
    const beforeLocal = await native(
      'return await api.storage.local.get(null);',
    );
    const beforeSync = await native('return await api.storage.sync.get(null);');
    const privateWindow = await native(
      'const window = await api.windows.create({incognito: true, url: api.runtime.getURL("/popup.html")}); return {id: window?.id ?? null};',
    );
    await driver.wait(() => findPage('popup.html', true), 20_000);
    privateWindow.id = await native(
      'return (await api.windows.getCurrent()).id;',
    );
    await driver.wait(
      until.elementIsEnabled(
        await driver.wait(until.elementLocated(By.id('entries')), 20_000),
      ),
      30_000,
    );
    const marker =
      destination + '/private/café?q=%2526&token=synthetic-private';
    const area = await driver.findElement(By.id('entries'));
    await area.clear();
    await area.sendKeys(marker);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/workspace.read' })).draft.lines?.[0] ===
        marker,
      30_000,
    );
    const original = await rpc({ type: 'buo:service/workspace.read' });
    assert.equal(original.private, true);
    await driver.wait(
      async () =>
        await native(
          'try { await api.contextMenus.update("buo-root", {}); return true; } catch { return false; }',
        ),
      15_000,
      'Private menus must mirror regular saved lists.',
    );
    await clickText('New');
    await driver.wait(
      () => findPage('new-list.html', true),
      20_000,
      'The editor must open inside a private window.',
    );
    const name = await driver.wait(
      until.elementLocated(By.id('list-name')),
      20_000,
    );
    await driver.wait(until.elementIsEnabled(name), 30_000);
    assert.equal(
      await driver.findElement(By.id('list-entries')).getAttribute('value'),
      marker,
    );
    await name.sendKeys('Private café example');
    await clickText('Save list');
    await driver.wait(until.urlContains('edit-list.html'), 30_000);
    const saved = await rpc({ type: 'buo:service/workspace.read' });
    const privateList = saved.data.lists.find(
      (list) => list.name === 'Private café example',
    );
    assert.equal(
      await native(
        'try { await api.contextMenus.update("buo-list:" + arguments[0], {}); return true; } catch { return false; }',
        privateList.id,
      ),
      false,
      'Private-only list names must not enter the global menu.',
    );
    assert(
      saved.data.lists.some(
        (list) =>
          list.name === 'Private café example' && list.lines[0] === marker,
      ),
    );
    await settings({ tabCreationDelay: 3 });
    await page('popup.html');
    const active = await rpc({ type: 'buo:service/library.read' });
    const job = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      expectedHead: active.head,
      lines: [marker, marker + '&second=1'],
    });
    assert(
      (await native('return await api.alarms.getAll();')).some(
        (alarm) => alarm.name === 'buo-private-opening-recovery',
      ),
    );
    await page('opening.html?job=' + job.plan.id);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/jobs.list' })).find(
          (item) => item.plan.id === job.plan.id,
        )?.run.status === 'completed',
      45_000,
    );
    const complete = (await rpc({ type: 'buo:service/jobs.list' })).find(
      (item) => item.plan.id === job.plan.id,
    );
    const opened = await native(
      'return await api.tabs.get(arguments[0]);',
      complete.receipts[0].tabId,
    );
    assert.equal(opened.incognito, true);
    assert.equal(opened.windowId, privateWindow.id);
    assert.equal(opened.url, new URL(marker).href);
    await page('data.html');
    const blocked = await native(
      'return await api.runtime.sendMessage({type: "buo:service/sync.preview-upload"});',
    );
    assert.equal(blocked.error, 'PRIVATE_SYNC_UNAVAILABLE');
    await stopBackground();
    await page('popup.html');
    const resumed = await rpc({ type: 'buo:service/workspace.read' });
    assert(
      resumed.data.lists.some((list) => list.name === 'Private café example'),
    );
    assert.equal(resumed.draft.lines[0], marker);
    const sessionData =
      target === 'firefox'
        ? await native('return await api.storage.session.get(null);')
        : await native(
            'return await new Promise((resolve, reject) => { const request = indexedDB.open("bulk-url-opener-private", 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const read = db.transaction("state").objectStore("state").get("records"); read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => reject(read.error); }; });',
          );
    assert(JSON.stringify(sessionData).includes('synthetic-private'));
    const second = await native(
      'const window = await api.windows.create({incognito: true, url: api.runtime.getURL("/popup.html")}); return {id: window.id};',
    );
    const secondHandle = await driver.wait(
      () => findPage('popup.html', true, second.id),
      20_000,
    );
    await native(
      'await api.windows.remove(arguments[0]); return true;',
      privateWindow.id,
    );
    assert(
      (await rpc({ type: 'buo:service/workspace.read' })).data.lists.some(
        (list) => list.name === 'Private café example',
      ),
    );
    const captured = await rpc({ type: 'buo:service/capture' });
    assert(captured.lines.every((url) => !url.includes('/batch-')));
    await driver.switchTo().window(normalHandle);
    const normalCaptured = await rpc({ type: 'buo:service/capture' });
    assert.equal(
      await native(
        'try { await api.contextMenus.update("buo-root", {}); return true; } catch { return false; }',
      ),
      true,
      'Private menu refresh must retain the regular menu.',
    );
    assert(
      normalCaptured.lines.every((url) => !url.includes('synthetic-private')),
    );
    await driver.switchTo().window(secondHandle);
    await driver.close();
    await driver.switchTo().window(normalHandle);
    await driver.wait(
      async () =>
        Object.keys(
          await native('return await api.storage.session.get(null);'),
        ).every((key) => !key.startsWith('buo:private:v1:')),
      30_000,
    );
    if (target === 'chrome') {
      assert.equal(
        (await native('return await indexedDB.databases();')).some(
          (database) => database.name === 'bulk-url-opener-private',
        ),
        false,
        'Private IndexedDB must not exist in the regular partition.',
      );
      await native(
        'await api.windows.create({incognito: true, url: api.runtime.getURL("/popup.html")}); return true;',
      );
      await driver.wait(() => findPage('popup.html', true), 20_000);
      const fresh = await rpc({ type: 'buo:service/workspace.read' });
      assert(
        !fresh.data.lists.some((list) => list.name === 'Private café example'),
      );
      assert(!JSON.stringify(fresh.draft).includes('synthetic-private'));
      await driver.close();
      await driver.switchTo().window(normalHandle);
      report.privateStorage =
        'isolated incognito IndexedDB; new private context starts fresh';
    } else
      report.privateStorage = 'storage.session; final-window namespace cleared';
    assert.deepEqual(
      await native('return await api.storage.local.get(null);'),
      beforeLocal,
    );
    assert.deepEqual(
      await native('return await api.storage.sync.get(null);'),
      beforeSync,
    );
    report.assertions.push(
      'private grant, private editor handoff/CRUD/job, scope isolation, background restart, joined window and final cleanup',
    );
  },
);

test(
  'a suspended background resumes acknowledged work from its recovery alarm',
  { timeout: 100_000 },
  async () => {
    await settings({
      tabCreationDelay: 6,
      loadOnFocus: false,
      newTabsActive: false,
    });
    await page('popup.html');
    const active = await rpc({ type: 'buo:service/library.read' });
    const prefix = '/worker-' + id().slice(0, 8);
    const paths = [prefix + '/one', prefix + '/two', prefix + '/three'];
    const job = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      expectedHead: active.head,
      lines: paths.map((path) => destination + path),
    });
    await page('opening.html?job=' + job.plan.id);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/jobs.list' })).find(
          (item) => item.plan.id === job.plan.id,
        )?.run.cursor === 1,
      25_000,
    );
    // Dispose the progress document and its pending storage-change debounce.
    // An extension page left open could otherwise wake a stopped background
    // itself, making an alarm-recovery check pass for the wrong reason.
    await navigate(destination + '/worker-observer');
    const stopped = await stopBackground();
    // No runtime messages or page navigation during this wait: recovery must
    // come from the browser alarm, rather than an artificial test RPC wakeup.
    const deadline = Date.now() + 60_000;
    while (
      !paths.every((path) => requests.includes(path)) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 250));
    assert(
      paths.every((path) => requests.includes(path)),
      'Alarm recovery must open every remaining destination.',
    );
    for (const path of paths)
      assert.equal(
        requests.filter((item) => item === path).length,
        1,
        'Acknowledged work must not repeat.',
      );
    await page('opening.html?job=' + job.plan.id);
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/jobs.list' })).find(
          (item) => item.plan.id === job.plan.id,
        )?.run.status === 'completed',
      15_000,
    );
    report.assertions.push(
      'real background termination and alarm-only recovery without replaying acknowledged tabs',
    );
    report.backgroundRecovery = stopped.kind;
    await settings({ tabCreationDelay: 0.125 });
  },
);

test(
  'held tabs keep destinations out of helper URLs and navigate only when selected',
  { timeout: 60_000 },
  async () => {
    await settings({
      loadOnFocus: true,
      newTabsActive: false,
      tabCreationDelay: 0,
    });
    await page('popup.html');
    const active = await rpc({ type: 'buo:service/library.read' });
    const path = '/held-' + id().slice(0, 8) + '?q=%2526&note=caf%C3%A9';
    const url = destination + path;
    const job = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      expectedHead: active.head,
      lines: [url],
    });
    await page('opening.html?job=' + job.plan.id);
    let completed;
    await driver.wait(async () => {
      completed = (await rpc({ type: 'buo:service/jobs.list' })).find(
        (item) => item.plan.id === job.plan.id,
      );
      return completed?.run.status === 'completed';
    }, 20_000);
    const tabId = completed.receipts[0].tabId;
    const tab = await native('return await api.tabs.get(arguments[0]);', tabId);
    assert(tab.url.startsWith(root + 'deferred.html?'));
    assert(!tab.url.includes('held-') && !tab.url.includes('caf'));
    assert(
      !requests.includes(path),
      'An inactive held tab must not contact its destination.',
    );
    await page('popup.html');
    assert((await rpc({ type: 'buo:service/capture' })).lines.includes(url));
    await native(
      'await api.windows.update(arguments[0], {focused: true}); await api.tabs.update(arguments[1], {active: true}); return true;',
      tab.windowId,
      tabId,
    );
    await driver.wait(
      async () =>
        (await native('return await api.tabs.get(arguments[0]);', tabId))
          .url === url,
      20_000,
    );
    await driver.wait(() => requests.includes(path), 15_000);
    assert.equal(requests.filter((item) => item === path).length, 1);
    await driver.switchTo().window(normalRootHandle);
    await settings({ loadOnFocus: false, tabCreationDelay: 0.125 });
    report.assertions.push(
      'real held-tab selection, opaque helper URL, exact encoding and capture',
    );
  },
);

test(
  'unsafe schemes are rejected before tab creation and browser restrictions stay visible',
  { timeout: 45_000 },
  async () => {
    await page('popup.html');
    const active = await rpc({ type: 'buo:service/library.read' });
    const inputs = [
      'javascript:alert(1)',
      'data:text/html,synthetic',
      root + 'options.html',
    ];
    const job = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      expectedHead: active.head,
      lines: inputs,
    });
    assert.equal(job.plan.destinations.length, 0);
    assert.equal(job.plan.rejected.length, inputs.length);
    assert(job.plan.rejected.every((item) => item.reason === 'blocked-scheme'));
    const restricted = await rpc({
      type: 'buo:service/open.lines',
      id: id(),
      expectedHead: active.head,
      lines: ['about:config'],
    });
    await page('opening.html?job=' + restricted.plan.id);
    let result;
    await driver.wait(async () => {
      result = (await rpc({ type: 'buo:service/jobs.list' })).find(
        (item) => item.plan.id === restricted.plan.id,
      );
      return ['completed', 'needs-review'].includes(result?.run.status);
    }, 20_000);
    if (result.run.status === 'needs-review')
      assert.equal(result.run.error, 'TAB_CREATE_FAILED');
    else {
      assert.equal(result.receipts[0].kind, 'opened');
      // A tab acknowledgement is not evidence that a privileged browser page
      // was usable. Record the actual result without escalating permission.
      const tab = await native(
        'return await api.tabs.get(arguments[0]);',
        result.receipts[0].tabId,
      );
      report.restrictedTabUrl = tab.url;
      await native('await api.tabs.remove(arguments[0]); return true;', tab.id);
    }
    report.restrictedResult = result.run.status;
    report.assertions.push(
      'unsafe schemes blocked and privileged destination result visible',
    );
  },
);

test(
  'a UTF-8 JSON file is inspected before replacement and retains the draft and jobs',
  { timeout: 60_000 },
  async () => {
    await page('opening.html');
    const jobs = await rpc({ type: 'buo:service/jobs.list' });
    await page('data.html');
    const before = await rpc({ type: 'buo:service/library.read' });
    const draft = (await rpc({ type: 'buo:service/workspace.read' })).draft;
    const exported = JSON.parse(
      await rpc({ type: 'buo:service/data.export', legacy: false }),
    );
    const imported = structuredClone(exported);
    imported.lists[0].name = 'Synthetic café <img src=x onerror=alert(1)>';
    const file = resolve(evidence, 'synthetic-import.json');
    await writeFile(file, JSON.stringify(imported));
    await driver.findElement(By.id('import-file')).sendKeys(file);
    await driver.wait(until.elementLocated(By.id('transfer-title')), 20_000);
    assert.deepEqual(
      (await rpc({ type: 'buo:service/library.read' })).head,
      before.head,
    );
    assert.equal(
      await driver.executeScript(
        'return Boolean(document.querySelector(".transfer-review img"));',
      ),
      false,
    );
    await audit('file-import-review');
    await driver
      .findElement(By.css('.transfer-review input[type=checkbox]'))
      .click();
    await clickText('Replace lists and settings');
    await driver.wait(
      async () =>
        (await rpc({ type: 'buo:service/library.read' })).data.lists[0].name ===
        imported.lists[0].name,
      25_000,
    );
    assert.deepEqual(
      JSON.parse(await rpc({ type: 'buo:service/data.export', legacy: false })),
      imported,
    );
    assert.deepEqual(
      (await rpc({ type: 'buo:service/workspace.read' })).draft,
      draft,
    );
    await page('opening.html');
    assert.deepEqual(await rpc({ type: 'buo:service/jobs.list' }), jobs);
    report.assertions.push(
      'real UTF-8 file import, escaped review, explicit replacement and retained draft/jobs',
    );
  },
);

test(
  'reviewed manual sync uses the real local API cache and preserves legacy keys',
  { timeout: 45_000 },
  async () => {
    await page('data.html');
    const before = await rpc({ type: 'buo:service/library.read' });
    const portable = JSON.parse(
      await rpc({ type: 'buo:service/data.export', legacy: false }),
    );
    const legacy = JSON.parse(
      await rpc({ type: 'buo:service/data.export', legacy: true }),
    );
    await native(
      'await api.storage.sync.set({user_settings: arguments[0]}); return true;',
      JSON.stringify(legacy),
    );
    await clickText('Review upload');
    await driver.wait(
      until.elementLocated(
        By.xpath('//h3[normalize-space(.)="Review sync upload"]'),
      ),
      15_000,
    );
    await driver
      .findElement(By.css('.transfer-review input[type=checkbox]'))
      .click();
    await driver.wait(
      until.elementIsEnabled(
        await driver.findElement(
          By.xpath('//button[normalize-space(.)="Upload reviewed copy"]'),
        ),
      ),
      10_000,
    );
    if (target === 'firefox') {
      await native(
        'return await api.permissions.remove({data_collection: ["technicalAndInteraction"]});',
      );
      const review = await rpc({ type: 'buo:service/sync.preview-upload' });
      const stores = await native(
        'return {local: await api.storage.local.get(null), sync: await api.storage.sync.get(null)};',
      );
      const refusal = await native(
        'return await api.runtime.sendMessage(arguments[0]);',
        {
          type: 'buo:service/sync.upload',
          id: review.id,
          acknowledge: true,
        },
      );
      assert.deepEqual(refusal, { ok: false, error: 'SYNC_CONSENT_REQUIRED' });
      assert.deepEqual(
        await native(
          'return {local: await api.storage.local.get(null), sync: await api.storage.sync.get(null)};',
        ),
        stores,
      );
      await driver.setContext(firefox.Context.CHROME);
      try {
        const granted = await driver.executeAsyncScript(
          `const done = arguments[arguments.length - 1]; const {ExtensionPermissions} = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs'); ExtensionPermissions.add(arguments[0], {permissions: [], origins: [], data_collection: ['technicalAndInteraction']}).then(() => done({ok: true}), error => done({error: String(error)}));`,
          addonId,
        );
        assert(granted.ok, granted.error);
      } finally {
        await driver.setContext(firefox.Context.CONTENT);
      }
      await driver.wait(
        async () =>
          (
            await native('return await api.permissions.getAll();')
          ).data_collection.includes('technicalAndInteraction'),
        15_000,
      );
      report.assertions.push(
        'Firefox settings-data consent refusal preserves both stores; optional grant set by disposable test harness, native consent prompt remains manual',
      );
    }
    await clickText('Upload reviewed copy');
    await driver.wait(async () => {
      const state = await driver.executeScript(
        'return {alerts: Array.from(document.querySelectorAll("[role=alert]")).map(element => element.textContent), status: Array.from(document.querySelectorAll("[role=status]")).map(element => element.textContent)};',
      );
      assert.deepEqual(state.alerts, [], JSON.stringify(state));
      return state.status.some((text) => text.includes('verified locally'));
    }, 20_000);
    const remote = await native('return await api.storage.sync.get(null);');
    assert.equal(remote.user_settings, JSON.stringify(legacy));
    assert.deepEqual(remote['bulk-url-opener-v2'].data, portable);
    const preview = await rpc({
      type: 'buo:service/sync.download',
      legacy: false,
    });
    assert.deepEqual(preview.portable, portable);
    assert.deepEqual(
      (await rpc({ type: 'buo:service/library.read' })).head,
      before.head,
    );
    report.assertions.push(
      'reviewed real storage.sync cache upload/download and retained legacy key; no remote delivery claim',
    );
    report.syncScope = 'local API cache only; no browser accounts signed in';
  },
);

test(
  'a 5000-entry list saves and exports exactly; an oversized sync copy preserves local data',
  { timeout: 120_000 },
  async () => {
    await page('new-list.html');
    const name = await driver.findElement(By.id('list-name'));
    await driver.wait(until.elementIsEnabled(name), 15_000);
    const lines = Array.from(
      { length: 5000 },
      (_, index) =>
        destination + '/volume/' + index + '?q=%2526&note=caf%C3%A9',
    );
    await name.sendKeys('Synthetic volume list');
    await driver.executeScript(
      'const element = arguments[0]; element.value = arguments[1]; element.dispatchEvent(new Event("input", {bubbles: true}));',
      await driver.findElement(By.id('list-entries')),
      lines.join('\n'),
    );
    const start = performance.now();
    await clickText('Save list');
    await driver.wait(until.urlContains('edit-list.html'), 45_000);
    report.volumeSaveMilliseconds = Math.round(performance.now() - start);
    await page('data.html');
    const exported = JSON.parse(
      await rpc({ type: 'buo:service/data.export', legacy: false }),
    );
    assert.deepEqual(
      exported.lists.find((list) => list.name === 'Synthetic volume list')
        .lines,
      lines,
    );
    const before = await rpc({ type: 'buo:service/library.read' });
    const response = await native(
      'return await api.runtime.sendMessage({type: "buo:service/sync.preview-upload"});',
    );
    assert.equal(response.ok, false);
    assert.equal(response.error, 'SYNC_TOO_LARGE');
    assert.deepEqual(
      (await rpc({ type: 'buo:service/library.read' })).head,
      before.head,
    );
    report.assertions.push(
      '5000 exact saved/exported entries and oversized-sync rejection',
    );
  },
);

test(
  'real Chrome storage quota failure preserves the active library and existing recovery records',
  { skip: target !== 'chrome', timeout: 90_000 },
  async () => {
    await page('new-list.html');
    const before = await rpc({ type: 'buo:service/library.read' });
    const filled = await native(
      'const bytes = await api.storage.local.getBytesInUse(null); const limit = api.storage.local.QUOTA_BYTES; if (!Number.isSafeInteger(limit)) throw new Error("Missing quota constant"); const length = limit - bytes - 65536; if (length < 1) throw new Error("Profile is already at quota"); await api.storage.local.set({"buo-test:quota": "q".repeat(length)}); return {bytes, limit};',
    );
    try {
      const response = await native(
        'return await api.runtime.sendMessage(arguments[0]);',
        {
          type: 'buo:service/library.mutate',
          input: {
            id: id(),
            expectedHead: before.head,
            command: {
              kind: 'list.create',
              name: 'Quota must not replace the library',
              lines: [destination + '/quota?' + 'q'.repeat(128 * 1024)],
            },
          },
        },
      );
      assert.equal(response.ok, false);
      assert.equal(response.error, 'STORAGE_WRITE_FAILED');
      const after = await rpc({ type: 'buo:service/library.read' });
      assert.deepEqual(after, before);
      assert.equal(
        (await native('return await api.storage.local.get("buo-test:quota");'))[
          'buo-test:quota'
        ].length,
        filled.limit - filled.bytes - 65536,
      );
      report.quotaBytes = filled.limit;
      report.assertions.push(
        'real local quota failure leaves active head/data and test filler intact',
      );
    } finally {
      await native(
        'await api.storage.local.remove("buo-test:quota"); return true;',
      );
    }
  },
);

test(
  'repeated large-library saves measure retained-history growth without deleting recovery data',
  { skip: target !== 'chrome', timeout: 180_000 },
  async () => {
    await page('data.html');
    const measurements = [];
    let exhausted = false;
    for (let index = 0; index < 32; index++) {
      const before = await rpc({ type: 'buo:service/library.read' });
      const bytes = await native(
        'return await api.storage.local.getBytesInUse(null);',
      );
      const response = await native(
        'return await api.runtime.sendMessage(arguments[0]);',
        {
          type: 'buo:service/library.mutate',
          input: {
            id: id(),
            expectedHead: before.head,
            command: {
              kind: 'settings.update',
              patch: { nightMode: !before.data.settings.nightMode },
            },
          },
        },
      );
      measurements.push({
        save: index + 1,
        bytesBefore: bytes,
        saved: response.ok,
      });
      if (!response.ok) {
        assert.equal(response.error, 'STORAGE_WRITE_FAILED');
        assert.deepEqual(
          await rpc({ type: 'buo:service/library.read' }),
          before,
        );
        const recovery = await rpc({
          type: 'buo:migration/export',
          document: {},
        });
        assert.equal(recovery.format, 'bulk-url-opener-recovery');
        assert(Object.hasOwn(recovery.sources.storageLocal, 'buo:v2:head'));
        exhausted = true;
        break;
      }
      assert.equal(
        (await rpc({ type: 'buo:service/library.read' })).head.revision,
        before.head.revision + 1,
      );
    }
    report.retention = {
      measurements,
      exhausted,
      bytesAfter: await native(
        'return await api.storage.local.getBytesInUse(null);',
      ),
      scope:
        'Synthetic 5000-entry library; bounded save sequence in Chrome only, not a retention or unlimited-capacity guarantee.',
    };
    report.assertions.push(
      'retained-history volume measured; any quota rejection preserves the last acknowledged library and read-only recovery export',
    );
  },
);
