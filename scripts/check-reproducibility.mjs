import './verify-packages.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  archiveNames,
  directoryEntries,
  project,
  readArchive,
  sameEntries,
} from './package-lib.mjs';

const names = archiveNames(project);
const clean = mkdtempSync(join(tmpdir(), 'bulk-url-opener-repro-'));
const original = Object.fromEntries(
  ['chrome', 'firefox'].map((browser) => [
    browser,
    directoryEntries(join(project, '.output', browser + '-mv3')),
  ]),
);
const archives = directoryEntries(join(project, 'dist'));
try {
  for (const [name, bytes] of Object.entries(
    readArchive(readFileSync(join(project, 'dist', names.source))),
  )) {
    const path = join(clean, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  // Synthetic, untracked decoys must never enter a repackaged source archive.
  for (const name of [
    '.env',
    'private/synthetic-export.json',
    'browser-profiles/synthetic/preferences.json',
  ]) {
    const path = join(clean, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'SYNTHETIC_PRIVATE_DATA=do-not-package\n');
  }
  const npmCli = process.env.npm_execpath;
  assert(npmCli, 'Run this check through npm run check:reproducibility.');
  for (const args of [
    ['ci', '--include=dev', '--no-audit'],
    ['run', 'validate'],
    ['run', 'package:built'],
    ['run', 'check:packages'],
  ])
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [npmCli, ...args], {
        cwd: clean,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                'Clean npm ' + args.join(' ') + ' failed: ' + (signal ?? code),
              ),
            ),
      );
    });
  for (const browser of ['chrome', 'firefox'])
    sameEntries(
      directoryEntries(join(clean, '.output', browser + '-mv3')),
      original[browser],
      browser + ' clean build',
    );
  sameEntries(
    directoryEntries(join(clean, 'dist')),
    archives,
    'Rebuilt package archives',
  );
  assert(
    !Object.keys(
      readArchive(readFileSync(join(clean, 'dist', names.source))),
    ).some(
      (name) =>
        name === '.env' ||
        name.startsWith('private/') ||
        name.startsWith('browser-profiles/'),
    ),
  );
  console.log(
    'Clean source archive reproduced both builds, all three ZIPs and checksums byte-for-byte; private decoys excluded.',
  );
} finally {
  rmSync(clean, { recursive: true, force: true });
}
