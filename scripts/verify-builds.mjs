import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  readFileSync(join(project, 'package.json'), 'utf8'),
);
const pages = [
  'popup.html',
  'options.html',
  'new-list.html',
  'edit-list.html',
  'opening.html',
  'deferred.html',
];

function filesWithin(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

for (const browser of ['chrome', 'firefox']) {
  const output = join(project, '.output', `${browser}-mv3`);
  const manifest = JSON.parse(
    readFileSync(join(output, 'manifest.json'), 'utf8'),
  );
  const files = filesWithin(output);

  function resource(reference, from = 'manifest.json') {
    const base = new URL(from, 'https://extension.invalid/');
    const url = new URL(reference, base);
    assert.equal(
      url.origin,
      base.origin,
      `${browser}: external resource ${reference}`,
    );
    const path = resolve(output, `.${decodeURIComponent(url.pathname)}`);
    assert(
      !relative(output, path).startsWith('..'),
      `${browser}: resource leaves output directory`,
    );
    assert(
      statSync(path).isFile(),
      `${browser}: missing resource ${reference}`,
    );
    return path;
  }

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.name, 'Bulk URL Opener');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.options_ui.page, 'options.html');
  assert.equal(manifest.options_ui.open_in_tab, true);
  assert(manifest.commands._execute_action);
  assert(!manifest.commands._execute_browser_action);
  assert.deepEqual(
    manifest.permissions ?? [],
    ['storage', 'tabs', 'alarms', 'contextMenus'],
    'Phase 3 permissions implement storage, capture, job recovery and saved-list menus',
  );
  assert.deepEqual(manifest.host_permissions ?? [], []);
  assert.deepEqual(manifest.content_scripts ?? [], []);
  assert.deepEqual(manifest.web_accessible_resources ?? [], []);
  const csp = manifest.content_security_policy.extension_pages;
  assert(csp.includes("script-src 'self'"));
  assert(csp.includes("object-src 'none'"));
  assert(!/unsafe-inline|unsafe-eval|https?:/.test(csp));

  if (browser === 'firefox') {
    assert(!manifest.background.service_worker);
    assert(manifest.background.scripts.length > 0);
    manifest.background.scripts.forEach((path) => resource(path));
    assert.equal(
      manifest.browser_specific_settings.gecko.id,
      '{c5b32a48-5514-4a46-81f2-075ebf3cbc29}',
    );
    assert.equal(
      manifest.browser_specific_settings.gecko.strict_min_version,
      '142.0',
    );
    assert.deepEqual(
      manifest.browser_specific_settings.gecko.data_collection_permissions
        .required,
      ['browsingActivity', 'searchTerms'],
    );
  } else {
    resource(manifest.background.service_worker);
    assert(!manifest.background.scripts);
    assert(!manifest.browser_specific_settings);
    assert.equal(manifest.minimum_chrome_version, '120');
  }

  for (const page of pages) {
    const html = readFileSync(resource(page), 'utf8');
    assert(
      /<html[^>]*lang="en"/.test(html),
      `${page}: missing document language`,
    );
    assert(/name="viewport"/.test(html), `${page}: missing viewport`);
    assert(!/\son\w+\s*=/i.test(html), `${page}: inline event handler`);
    for (const match of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      const source = /\bsrc=["']([^"']+)["']/i.exec(match[1]);
      assert(source, `${page}: inline script`);
      assert.equal(match[2].trim(), '', `${page}: inline script body`);
      resource(source[1], page);
    }
    for (const match of html.matchAll(
      /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    )) {
      resource(match[1], page);
    }
  }

  for (const [size, reference] of Object.entries(manifest.icons)) {
    const png = readFileSync(resource(reference));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }

  for (const file of files) {
    const name = relative(output, file).replaceAll('\\', '/');
    assert(
      !/^(app|test|docs|node_modules|private|work)\//.test(name),
      `Unexpected packaged source: ${name}`,
    );
    assert(
      /\.(html|js|css|json|png|map)$/.test(name),
      `Unexpected packaged file: ${name}`,
    );
    if (file.endsWith('.js')) {
      const code = readFileSync(file, 'utf8');
      assert(
        !/require\(["']electron["']\)/.test(code),
        `Electron runtime in ${name}`,
      );
      assert(
        !/\beval\s*\(|new Function\s*\(/.test(code),
        `Dynamic code evaluation in ${name}`,
      );
    }
    if (file.endsWith('.css')) {
      assert(
        !/https?:\/\//.test(readFileSync(file, 'utf8')),
        `External CSS/font request in ${name}`,
      );
    }
  }

  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  console.log(
    `${browser}: MV3 manifest, ${pages.length} pages, icons, CSP and ${files.length} packaged resources verified (${bytes} bytes).`,
  );
}
