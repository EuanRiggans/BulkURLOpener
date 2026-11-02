import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Zip, ZipPassThrough, zipSync } from 'fflate';
import {
  archivePath,
  directoryEntries,
  readArchive,
  sameEntries,
  sourceEntries,
  sourceManifest,
  sourcePaths,
  zipEntries,
} from '../../scripts/package-lib.mjs';

const required = [
  'package.json',
  'package-lock.json',
  'LICENSE',
  'wxt.config.ts',
  'src/entrypoints/background.ts',
  'scripts/package.mjs',
];
const runFile = promisify(execFile);
function write(root, name, contents = 'synthetic source\n') {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
async function fixture(work) {
  const root = mkdtempSync(join(tmpdir(), 'bulk-url-opener-package-test-'));
  try {
    return await work(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function source(root) {
  for (const file of required) write(root, file);
}

test('archive paths reject absolute names and traversal on either platform', () => {
  for (const path of [
    '',
    '../export.json',
    '/absolute',
    'a/../../profile',
    'a//b',
    'a/./b',
    'C:/profile',
    '..\\profile',
    'bad\0name',
  ])
    assert.throws(() => archivePath(path));
  assert.equal(archivePath('src/café/example.ts'), 'src/café/example.ts');
});

test('ZIP inspection rejects duplicate members and escaping members before extraction', () => {
  assert.throws(() =>
    readArchive(zipSync({ '../private.json': Buffer.from('synthetic') })),
  );
  const chunks = [];
  const zip = new Zip((error, data) => {
    assert.ifError(error);
    chunks.push(data);
  });
  for (let index = 0; index < 2; index++) {
    const file = new ZipPassThrough('duplicate.txt');
    zip.add(file);
    file.push(Buffer.from(String(index)), true);
  }
  zip.end();
  assert.throws(
    () => readArchive(Buffer.concat(chunks)),
    /Duplicate ZIP member/,
  );
});

test('archives preserve exact bytes and reproduce regardless of insertion order', () => {
  const first = {
    'z.bin': Buffer.from([0, 255, 10]),
    'nested/a.txt': Buffer.from('café\n'),
  };
  const reversed = Object.fromEntries(Object.entries(first).reverse());
  const a = zipEntries(first),
    b = zipEntries(reversed);
  assert(a.equals(b));
  assert.equal(a.readUInt16LE(10), 0);
  assert.equal(a.readUInt16LE(12), 33); // DOS date: 1 January 1980.
  sameEntries(readArchive(a), first, 'binary round-trip');
});

test('both recursive builds and source manifests reject symlinked directories', () =>
  fixture(async (root) => {
    source(root);
    const outside = mkdtempSync(join(tmpdir(), 'bulk-url-opener-outside-'));
    try {
      write(outside, 'example.txt');
      symlinkSync(outside, join(root, 'linked'), 'junction');
      write(
        root,
        sourceManifest,
        JSON.stringify({
          version: 1,
          files: [...required, 'linked/example.txt'],
        }),
      );
      await assert.rejects(sourcePaths(root), /Symbolic links/);
      assert.throws(() => directoryEntries(root), /Symbolic links/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  }));

test('checkout source includes staged files and ignores private untracked files', () =>
  fixture(async (root) => {
    source(root);
    await runFile('git', ['init', '--quiet'], { cwd: root });
    await runFile('git', ['add', '--', ...required], { cwd: root });
    write(root, '.env', 'SYNTHETIC_SECRET=not-for-export');
    write(root, 'private/example.json');
    write(root, 'browser-profiles/synthetic/preferences.json');
    assert.deepEqual(await sourcePaths(root), [...required].sort());
    assert.equal(
      Object.keys(await sourceEntries(root)).length,
      required.length + 1,
    );
    await runFile('git', ['add', '--', 'private/example.json'], { cwd: root });
    await assert.rejects(sourcePaths(root), /Private\/generated/);
  }));

test('exported source rebuilds from its manifest while excluding new private files', () =>
  fixture(async (root) => {
    source(root);
    write(
      root,
      sourceManifest,
      JSON.stringify({ version: 1, files: [...required].reverse() }),
    );
    write(root, '.env', 'SYNTHETIC_SECRET=not-for-export');
    write(root, 'private/example.json');
    const entries = await sourceEntries(root);
    assert.deepEqual(
      Object.keys(entries).sort(),
      [...required, sourceManifest].sort(),
    );
    sameEntries(readArchive(zipEntries(entries)), entries, 'exported source');
    write(root, 'app/obsolete.js');
    write(
      root,
      sourceManifest,
      JSON.stringify({ version: 1, files: [...required, 'app/obsolete.js'] }),
    );
    await assert.rejects(sourcePaths(root), /Retired code/);
  }));

test('incomplete source and altered archive contents fail verification', () =>
  fixture(async (root) => {
    source(root);
    write(
      root,
      sourceManifest,
      JSON.stringify({ version: 1, files: required.slice(1) }),
    );
    await assert.rejects(sourcePaths(root), /Incomplete source/);
    assert.throws(
      () =>
        sameEntries(
          { a: Buffer.from('changed') },
          { a: Buffer.from('original') },
          'example',
        ),
      /contents differ/,
    );
    assert.throws(
      () =>
        sameEntries(
          { a: Buffer.from('x'), unexpected: Buffer.from('x') },
          { a: Buffer.from('x') },
          'example',
        ),
      /member list differs/,
    );
  }));
