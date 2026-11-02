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
        .addArguments('-headless', '--allow-system-access')
        .setPreference(
          'extensions.webextensions.uuids',
          JSON.stringify({ [addonId]: uuid }),
        );
      if (process.env.BUO_BROWSER_BIN)
        options.setBinary(process.env.BUO_BROWSER_BIN);
      builder.setFirefoxOptions(options);
      if (process.env.BUO_DRIVER_BIN)
        builder.setFirefoxService(
          new firefox.ServiceBuilder(process.env.BUO_DRIVER_BIN),
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
async function page(path) {
  await navigate(root + path);
  await driver.wait(until.elementLocated(By.css('h1')), 15_000);
}
async function navigate(url) {
  if (target === 'chrome') return driver.get(url);
  await driver.setContext(firefox.Context.CHROME);
  try {
    await driver.executeScript(
      'gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});',
      url,
    );
  } finally {
    await driver.setContext(firefox.Context.CONTENT);
  }
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
