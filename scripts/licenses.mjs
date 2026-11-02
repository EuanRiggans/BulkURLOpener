import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { project } from './package-lib.mjs';

const bundled = [
  'preact',
  'valibot',
  'superlock',
  'wxt',
  '@wxt-dev/browser',
  '@wxt-dev/storage',
];
function metadata(name) {
  const data = JSON.parse(
    readFileSync(join(project, 'node_modules', name, 'package.json'), 'utf8'),
  );
  assert.equal(data.license, 'MIT', 'Review changed licensing for ' + name);
  return name + '@' + data.version;
}
export function expectedLicenses() {
  const sections = [
    'Bulk URL Opener — bundled licences\n\nThe browser preview bundles the following MIT-licensed code.\n',
    'Bulk URL Opener (including icons)\nSource: https://github.com/EuanRiggans/BulkURLOpener\n\n' +
      readFileSync(join(project, 'LICENSE'), 'utf8').trim(),
  ];
  for (const [name, file] of [
    ['preact', 'LICENSE'],
    ['valibot', 'LICENSE.md'],
    ['superlock', 'LICENSE.md'],
  ])
    sections.push(
      metadata(name) +
        '\n\n' +
        readFileSync(join(project, 'node_modules', name, file), 'utf8').trim(),
    );
  sections.push(
    ['wxt', '@wxt-dev/browser', '@wxt-dev/storage'].map(metadata).join('\n') +
      '\nSource: https://github.com/wxt-dev/wxt/blob/main/LICENSE\n\n' +
      readFileSync(join(project, 'licenses/wxt-MIT.txt'), 'utf8').trim(),
  );
  return sections.join('\n\n') + '\n';
}
export function verifyLicenses(packagedNames, text) {
  assert.equal(
    text,
    expectedLicenses(),
    'Regenerate notices with npm run licenses:update after reviewing dependency licences.',
  );
  for (const name of packagedNames)
    assert(
      bundled.includes(name),
      'A bundled dependency needs a licence notice: ' + name,
    );
}
if (process.argv.includes('--write')) {
  writeFileSync(join(project, 'public/LICENSES.txt'), expectedLicenses());
  console.log(
    'Updated public/LICENSES.txt from installed dependency versions and reviewed licence sources.',
  );
}
