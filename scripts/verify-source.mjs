import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, retiredPaths } from './package-lib.mjs';

for (const path of retiredPaths)
  assert(
    !existsSync(join(project, path)),
    'Retired source is still present: ' + path,
  );
const forbidden = new Set([
  'electron',
  'electron-builder',
  'electron-chromedriver',
  'spectron',
  'mocha',
  'jquery',
  'bootstrap',
  'font-awesome',
]);
const lock = JSON.parse(
  readFileSync(join(project, 'package-lock.json'), 'utf8'),
);
for (const path of Object.keys(lock.packages)) {
  const name = path.split('node_modules/').at(-1);
  assert(
    !forbidden.has(name),
    'Retired dependency is still installed: ' + name,
  );
}
for (const file of [
  'current-profile',
  'numeric-profile',
  'pre-json-profile',
  'pre-marker-profile',
  'conflicting-mirrors',
  'mirror-only-profile',
  'damaged-profile',
  'default-settings',
  'export-v1',
  'zero-id-export',
])
  assert(
    existsSync(join(project, 'test/fixtures/legacy', file + '.json')),
    'Historical migration fixture is missing: ' + file,
  );
console.log(
  'Browser-only source/dependencies verified; all historical migration fixtures retained.',
);
