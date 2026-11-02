import './verify-source.mjs';
import './verify-builds.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  archiveNames,
  directoryEntries,
  digest,
  project,
  readArchive,
  sameEntries,
  sourceEntries,
  zipEntries,
} from './package-lib.mjs';

const output = join(project, 'dist');
const names = archiveNames(project);
const candidates = [];
for (const kind of ['chrome', 'firefox', 'source']) {
  const entries =
    kind === 'source'
      ? await sourceEntries(project)
      : directoryEntries(join(project, '.output', kind + '-mv3'));
  const bytes = zipEntries(entries);
  sameEntries(readArchive(bytes), entries, names[kind]);
  candidates.push({ name: names[kind], bytes });
}
mkdirSync(output, { recursive: true });
for (const { name, bytes } of candidates)
  writeFileSync(join(output, name), bytes);
writeFileSync(
  join(output, 'SHA256SUMS'),
  candidates
    .map(({ name, bytes }) => digest(bytes) + '  ' + name + '\n')
    .join(''),
);
console.log(
  'Created verified Chrome, Firefox and source ZIPs with SHA-256 checksums in dist/.',
);
