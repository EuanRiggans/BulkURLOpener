import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  archiveNames,
  directoryEntries,
  digest,
  project,
  readArchive,
  sameEntries,
  sourceEntries,
} from './package-lib.mjs';

const output = join(project, 'dist');
const names = archiveNames(project);
assert.deepEqual(
  readdirSync(output).sort(),
  [...Object.values(names), 'SHA256SUMS'].sort(),
  'Unexpected files in package output.',
);
let checksums = '';
for (const kind of ['chrome', 'firefox', 'source']) {
  const bytes = readFileSync(join(output, names[kind]));
  const expected =
    kind === 'source'
      ? await sourceEntries(project)
      : directoryEntries(join(project, '.output', kind + '-mv3'));
  sameEntries(readArchive(bytes), expected, names[kind]);
  checksums += digest(bytes) + '  ' + names[kind] + '\n';
}
assert.equal(readFileSync(join(output, 'SHA256SUMS'), 'utf8'), checksums);
console.log('All ZIP members, contents and SHA-256 checksums verified.');
