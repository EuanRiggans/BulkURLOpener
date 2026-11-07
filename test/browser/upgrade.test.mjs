import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';

const target = process.env.BUO_TEST_BROWSER;
assert(['chrome', 'firefox'].includes(target), 'Set BUO_TEST_BROWSER.');
const label = process.env.BUO_TEST_LABEL || target;
assert(/^[a-z-]+$/.test(label));
const evidence = resolve('test-results', label);
const addonId = '{c5b32a48-5514-4a46-81f2-075ebf3cbc29}';
const uuid = '11111111-2222-4333-8444-555555555555';
const runFile = promisify(execFile);
const candidate = resolve('.output', target + '-mv3');
const candidateVersion = JSON.parse(
  await readFile(join(candidate, 'manifest.json'), 'utf8'),
).version;
assert.notEqual(
  candidateVersion,
  '1.0.0',
  'The candidate must update the fixture version.',
);
const raw = JSON.parse(
  await readFile('test/fixtures/legacy/current-profile.json', 'utf8'),
);
const fixture = {
  localStorage: raw.localStorage,
  storageLocal: raw.storageLocal,
  storageSync: raw.storageSync,
};
// This is an artificial seeding extension, never a signed/published 1.x binary.
const fixtureName = 'Bulk URL Opener Upgrade Fixture';
const report = {
  format: 'bulk-url-opener-development-upgrade',
  schemaVersion: 1,
  passed: false,
  source: process.env.GITHUB_SHA || 'local',
  browser: target,
  scope:
    'Same-ID development update from a synthetic legacy-store fixture; signatures, published binaries and native update prompts are not tested.',
};
let driver, root, extensionId, temporary, extension;

before(
  async () => {
    for (const path of [
      '/etc/chromium/policies/managed/extensions.json',
      '/etc/opt/chrome/policies/managed/extensions.json',
    ]) {
      if (existsSync(path))
        assert(
          !JSON.parse(
            await readFile(path, 'utf8'),
          ).ExtensionInstallBlocklist?.includes('*'),
          'Managed browser blocks extensions; use the browser CI job.',
        );
    }
    await mkdir(evidence, { recursive: true });
    temporary = await mkdtemp(join(tmpdir(), 'buo-upgrade-'));
    extension = join(temporary, 'extension');
    await mkdir(extension);
    await writeFile(
      join(extension, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: fixtureName,
        version: '1.0.0',
        permissions: ['storage'],
        action: { default_popup: 'seed.html' },
        ...(target === 'firefox'
          ? { browser_specific_settings: { gecko: { id: addonId } } }
          : {}),
      }),
    );
    await writeFile(
      join(extension, 'seed.html'),
      '<!doctype html><html lang="en"><title>Upgrade fixture</title><h1>Upgrade fixture</h1></html>',
    );
    const builder = new Builder().forBrowser(target);
    if (target === 'chrome') {
      const options = new chrome.Options({
        'goog:chromeOptions': { enableExtensionTargets: true },
      }).addArguments('--headless=new', '--load-extension=' + extension);
      if (process.env.BUO_BROWSER_BIN)
        options.setChromeBinaryPath(process.env.BUO_BROWSER_BIN);
      builder.setChromeOptions(options);
      if (process.env.BUO_DRIVER_BIN)
        builder.setChromeService(
          new chrome.ServiceBuilder(process.env.BUO_DRIVER_BIN),
        );
      driver = await builder.build();
      await driver.get('chrome://extensions');
      await driver.executeScript(
        'chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode: true});',
      );
      await driver.wait(
        () =>
          driver.executeAsyncScript(function (done) {
            chrome.developerPrivate.getProfileConfiguration((value) =>
              done(value.inDeveloperMode),
            );
          }),
        15_000,
      );
      await driver.wait(async () => {
        extensionId = await driver.executeScript(
          `return Array.from(document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-item-list')?.shadowRoot?.querySelectorAll('extensions-item') || []).map(x => x.data).find(x => x.name === arguments[0])?.id;`,
          fixtureName,
        );
        return Boolean(extensionId);
      }, 20_000);
      root = 'chrome-extension://' + extensionId + '/';
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
      assert.equal(await driver.installAddon(extension, true), addonId);
      root = 'moz-extension://' + uuid + '/';
    }
    await driver.manage().setTimeouts({ script: 30_000, pageLoad: 30_000 });
    const capabilities = await driver.getCapabilities();
    report.version = capabilities.get('browserVersion');
    report.platform = capabilities.get('platformName');
    await navigate(root + 'seed.html');
  },
  { timeout: 90_000 },
);

after(async () => {
  try {
    if (driver) await driver.quit();
  } finally {
    try {
      await mkdir(evidence, { recursive: true });
      await writeFile(
        join(evidence, 'upgrade-summary.json'),
        JSON.stringify(report, null, 2),
      );
    } finally {
      // Only the directory created by this test. Never use a user's browser profile.
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }
});

async function native(body, ...args) {
  const result = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1]; const page = window.wrappedJSObject || window; const api = page.browser || page.chrome || globalThis.browser || globalThis.chrome; (async () => { ${body} })().then(value => done({ok: true, value}), error => done({ok: false, error: String(error)}));`,
    ...args,
  );
  assert(result.ok, result.error);
  return result.value;
}
async function rpc(request) {
  const response = await native(
    'return await api.runtime.sendMessage(arguments[0]);',
    request,
  );
  assert(response?.ok, JSON.stringify(response));
  return response.value;
}
async function navigate(url) {
  if (target === 'chrome') await driver.get(url);
  else {
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
  }
  await driver.wait(until.urlIs(url), 15_000);
  await driver.wait(until.elementLocated(By.css('h1')), 15_000);
}
async function installCandidate() {
  if (target === 'chrome') {
    await driver.get('chrome://extensions');
  } else {
    // Reload closes extension documents. Keep Marionette's evaluation attached
    // to an ordinary tab instead of the document that is being unloaded.
    await driver.get('about:blank');
  }
  await rm(extension, { recursive: true });
  await cp(candidate, extension, { recursive: true });
  if (target === 'chrome') {
    const result = await driver.executeAsyncScript(function (
      extensionId,
      done,
    ) {
      chrome.developerPrivate.reload(extensionId, {}, () =>
        done({ error: chrome.runtime.lastError?.message ?? null }),
      );
    }, extensionId);
    assert.equal(result.error, null);
  } else {
    await driver.setContext(firefox.Context.CHROME);
    try {
      const result = await driver.executeAsyncScript(
        `const done = arguments[arguments.length - 1]; const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs'); (async () => { const addon = await AddonManager.getAddonByID(arguments[0]); await addon.reload(); return true; })().then(() => done({ok: true}), error => done({error: String(error)}));`,
        addonId,
      );
      assert(result.ok, result.error);
    } finally {
      await driver.setContext(firefox.Context.CONTENT);
    }
  }
  await driver.wait(
    async () => {
      try {
        await navigate(root + 'options.html');
        return (
          (await native('return api.runtime.getManifest().version;')) ===
            candidateVersion &&
          (
            await native(
              'return await api.runtime.sendMessage({type: "buo:migration/status"});',
            )
          ).ok
        );
      } catch {
        return false;
      }
    },
    30_000,
    'Candidate must replace the development fixture under the same origin.',
  );
}
async function captured() {
  return native(
    'return {localStorage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])), storageLocal: await api.storage.local.get(null), storageSync: await api.storage.sync.get(null)};',
  );
}
async function compare(before, after, name) {
  const beforePath = join(temporary, name + '-before.json');
  const afterPath = join(temporary, name + '-after.json');
  await writeFile(beforePath, JSON.stringify(before));
  await writeFile(afterPath, JSON.stringify(after));
  const result = await runFile(
    process.execPath,
    ['scripts/check-upgrade.mjs', beforePath, afterPath],
    { maxBuffer: 1024 * 1024 },
  );
  const comparison = JSON.parse(result.stdout);
  assert(comparison.passed, 'Upgrade data comparison must pass.');
  return comparison;
}

test(
  'same-identity development update retains historical stores, reviewed migration and the canonical library on reload',
  { timeout: 180_000 },
  async () => {
    await native(
      'for (const [key, value] of Object.entries(arguments[0].localStorage)) localStorage.setItem(key, value); await api.storage.local.set(arguments[0].storageLocal); await api.storage.sync.set(arguments[0].storageSync); return true;',
      fixture,
    );
    const before = await captured();
    assert.deepEqual(before, fixture);
    await installCandidate();
    assert.equal(
      await native('return api.runtime.id;'),
      target === 'firefox' ? addonId : extensionId,
    );
    assert.deepEqual(
      await captured(),
      before,
      'Installing the candidate must not migrate or overwrite legacy sources.',
    );
    assert.equal(
      (await rpc({ type: 'buo:migration/status' })).status,
      'uninitialized',
    );
    const document = (await captured()).localStorage;
    const review = await rpc({ type: 'buo:migration/prepare', document });
    const decisions = {
      acknowledgeIssues: true,
      preferences: Object.fromEntries(
        review.plan.preferences.map(({ key, options }) => [key, options[0].id]),
      ),
      historical: Object.fromEntries(
        review.plan.lists
          .filter((list) => list.reconstructed)
          .map((list) => [list.id, 'include']),
      ),
    };
    assert.equal(
      (
        await rpc({
          type: 'buo:migration/commit',
          document,
          backupDigest: review.backupDigest,
          baseHead: review.baseHead,
          decisions,
        })
      ).status,
      'ready',
    );
    const after = await rpc({ type: 'buo:migration/export', document });
    report.legacyMigration = await compare(before, after, 'legacy');
    await navigate(root + 'data.html');
    const legacy = JSON.parse(
      await rpc({ type: 'buo:service/data.export', legacy: true }),
    );
    assert.deepEqual(
      legacy.settings,
      JSON.parse(fixture.localStorage.settings),
      'All 17 preferences and references must survive.',
    );
    assert.deepEqual(
      legacy.lists.sort((a, b) => a.list_id - b.list_id),
      fixture.storageLocal.lists,
    );
    const active = await rpc({ type: 'buo:service/library.read' });
    assert.deepEqual(
      active.data.draftLines,
      JSON.parse(fixture.localStorage.previous_list_input),
    );
    assert.equal(active.data.recoveredInputs.length, 2);
    assert.equal(
      (await rpc({ type: 'buo:service/archives.list' })).length > 0,
      true,
    );
    await installCandidate();
    const reloaded = await rpc({
      type: 'buo:migration/export',
      document: (await captured()).localStorage,
    });
    report.canonicalReload = await compare(after, reloaded, 'canonical');
    const opened = await native(
      'return (await api.tabs.query({})).map(tab => tab.url || "");',
    );
    assert(
      opened.every((url) => !url.includes('.example.test')),
      'Migration and reload must not replay legacy pending tabs.',
    );
    report.noLegacyReplay = true;
    report.passed = true;
  },
);
