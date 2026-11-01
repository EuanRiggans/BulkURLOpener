import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import webExt from 'web-ext';
import { reviewFirefoxReport } from './firefox-warning-policy.ts';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(project, '.output/firefox-mv3');
const report = await webExt.cmd.lint(
  { sourceDir: output, output: 'none', boring: true },
  { shouldExitProgram: false },
);
const reviewed = reviewFirefoxReport(report, (warning) => {
  if (
    typeof warning.file !== 'string' ||
    typeof warning.line !== 'number' ||
    typeof warning.column !== 'number'
  )
    return null;
  const generated = resolve(output, warning.file);
  assert(!relative(output, generated).startsWith('..'));
  const map = new TraceMap(
    JSON.parse(readFileSync(`${generated}.map`, 'utf8')),
  );
  return originalPositionFor(map, {
    line: warning.line,
    column: warning.column - 1,
  }).source;
});
if (reviewed) {
  const preact = JSON.parse(
    readFileSync(join(project, 'node_modules/preact/package.json'), 'utf8'),
  );
  assert.equal(
    preact.version,
    '11.1.1',
    'A new Preact renderer version requires a fresh warning review.',
  );
}
console.log(
  `Mozilla validation: 0 errors, 0 unreviewed warnings; ${reviewed} reviewed Preact renderer warning(s).`,
);
