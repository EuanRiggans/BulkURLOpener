import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';

export const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runFile = promisify(execFile);
export const sourceManifest = '.source-manifest.json';
export const retiredPaths = [
  'app',
  'build',
  'main.js',
  'utilities',
  'unstable-build-script.sh',
  'test/spec.js',
  'test/characterization',
  '.github/workflows/baseline.yml',
];
export function archivePath(name) {
  assert(typeof name === 'string' && name.length > 0, 'Empty archive path.');
  assert(
    !name.includes('\\') && !name.includes('\0') && !name.includes(':'),
    'Invalid archive path.',
  );
  assert(
    !isAbsolute(name) &&
      name.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Archive path must stay within its root.',
  );
  return name;
}
export function filesWithin(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      const info = lstatSync(path);
      assert(!info.isSymbolicLink(), 'Symbolic links are not packaged.');
      assert(
        info.isFile() || info.isDirectory(),
        'Unsupported filesystem entry.',
      );
      return info.isDirectory() ? filesWithin(path) : [path];
    });
}
export function directoryEntries(directory) {
  return Object.fromEntries(
    filesWithin(directory).map((path) => [
      archivePath(relative(directory, path).replaceAll('\\', '/')),
      readFileSync(path),
    ]),
  );
}
export async function sourcePaths(root) {
  let paths;
  if (existsSync(join(root, sourceManifest))) {
    assert(
      lstatSync(join(root, sourceManifest)).isFile(),
      'The source manifest must be a regular file.',
    );
    const manifest = JSON.parse(
      readFileSync(join(root, sourceManifest), 'utf8'),
    );
    assert.equal(manifest.version, 1);
    assert(Array.isArray(manifest.files));
    paths = manifest.files;
  } else {
    const top = (
      await runFile('git', ['rev-parse', '--show-toplevel'], {
        cwd: root,
        encoding: 'utf8',
      })
    ).stdout.trim();
    assert.equal(
      realpathSync(top),
      realpathSync(root),
      'Package from the repository root.',
    );
    paths = (
      await runFile('git', ['ls-files', '--cached', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
    ).stdout
      .split('\0')
      .filter(Boolean);
  }
  assert.equal(new Set(paths).size, paths.length, 'Duplicate source path.');
  for (const path of paths) {
    archivePath(path);
    assert(
      path !== sourceManifest,
      'The generated manifest must not list itself.',
    );
    assert(
      !/^(\.git|node_modules|\.wxt|\.output|dist|private|work|browser-profiles|test-results)(\/|$)/.test(
        path,
      ),
      'Private/generated paths are not source files.',
    );
    assert(
      !path.split('/').some((part) => /^\.env(?:\.|$)/.test(part)),
      'Environment files are not packaged.',
    );
    assert(
      !retiredPaths.some((old) => path === old || path.startsWith(old + '/')),
      'Retired code is not packaged.',
    );
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++)
      assert(
        !lstatSync(join(root, ...parts.slice(0, index))).isSymbolicLink(),
        'Symbolic links are not packaged.',
      );
    const info = lstatSync(join(root, path));
    assert(
      info.isFile() && !info.isSymbolicLink(),
      'Source entries must be regular files.',
    );
  }
  for (const required of [
    'package.json',
    'package-lock.json',
    'LICENSE',
    'wxt.config.ts',
    'src/entrypoints/background.ts',
    'scripts/package.mjs',
  ])
    assert(paths.includes(required), 'Incomplete source archive: ' + required);
  return [...paths].sort();
}
export async function sourceEntries(root) {
  const paths = await sourcePaths(root);
  return {
    ...Object.fromEntries(
      paths.map((path) => [path, readFileSync(join(root, path))]),
    ),
    [sourceManifest]: Buffer.from(
      JSON.stringify({ version: 1, files: paths }, null, 2) + '\n',
    ),
  };
}
export function zipEntries(entries) {
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((name) => [archivePath(name), entries[name]]),
  );
  return Buffer.from(
    zipSync(sorted, {
      level: 9,
      mtime: new Date(1980, 0, 1),
      os: 3,
      attrs: 0o100644 * 65536,
    }),
  );
}
export function readArchive(bytes) {
  const names = new Set();
  return unzipSync(bytes, {
    filter(file) {
      archivePath(file.name);
      assert(!names.has(file.name), 'Duplicate ZIP member.');
      names.add(file.name);
      return true;
    },
  });
}
export function sameEntries(actual, expected, label) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    label + ': member list differs.',
  );
  for (const name of Object.keys(expected))
    assert(
      Buffer.from(actual[name]).equals(Buffer.from(expected[name])),
      label + ': contents differ: ' + name,
    );
}
export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function archiveNames(root) {
  const { version } = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  assert(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version));
  return Object.fromEntries(
    ['chrome', 'firefox', 'source'].map((kind) => [
      kind,
      `bulk-url-opener-${version}-${kind}.zip`,
    ]),
  );
}
