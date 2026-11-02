import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><html lang="en"><title>Synthetic destination</title><h1>Synthetic destination</h1></html>',
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    destination = 'http://127.0.0.1:' + server.address().port;
    const builder = new Builder().forBrowser(target);
    if (target === 'chrome') {
      const options = new chrome.Options().addArguments(
        '--headless=new',
        '--window-size=1280,960',
        '--load-extension=' + resolve('.output/chrome-mv3'),
        '--disable-extensions-except=' + resolve('.output/chrome-mv3'),
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
    await navigate(root + 'options.html');
    await driver.wait(until.elementLocated(By.css('h1')), 15_000);
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
