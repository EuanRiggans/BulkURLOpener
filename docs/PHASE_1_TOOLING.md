# Phase 1: Browser-only tooling

Phase 1 starts from `b2258cc35f53ff23eae82475e21c2da031ae086a` on the fresh
`redevelopment` branch. It establishes the modern build and test foundation while
retaining the original `app/` source and all historical storage fixtures. It does
not implement migration, active list persistence or the shared opening service.

## What is implemented

- WXT 0.21.5 and Vite 8.3.5 build separate Chromium and Firefox MV3 outputs.
- Strict TypeScript 6.0.3, Preact 11.1.1 and its official Vite preset provide a
  typed UI foundation. TypeScript 7 is not selected because the current supported
  TypeScript ESLint peer range stops below 6.1.
- A compact popup, options page and separate new-list/edit-list entrypoints share
  components and local CSS. Form labels, visible focus and light/dark system
  colours are present; final accessibility testing remains later work.
- Internal routes preserve list ID zero and encode parameter values safely.
  Browser URL access is isolated from the pure route helper.
- The preview's opening/capture/save/list-selection controls are visibly disabled.
  Typing, clearing and navigating to the new-list/options pages are available.
  Editor text stays in component memory only. No sample lists are presented as
  actual user data.
- The background entrypoint performs no storage initialization, migration,
  tab-opening jobs or menu registration. Context menus retain the exact planned
  `Bulk URL Opener > Open Lists > [saved lists]` contract for Phase 3.
- The generated builds contain only new runtime code, local CSS and copies of
  the existing four extension icons. Original assets and legacy source remain
  unchanged as references; tests/fixtures/docs are excluded from runtime builds.

`package.json` is the single version source, currently `2.0.0`. This denotes an
unreleased redevelopment preview. Production-mode compilation does not make the
preview ready to replace an installed version or submit to a store.

## Toolchain and legacy reference

The active npm package is private, uses ES modules, declares Node 24+, and aligns
its licence/repository metadata with the MIT source project. `.nvmrc` and CI use
Node 24. Dependencies are pinned and the lockfile is regenerated for this setup.

Electron, Spectron, Electron ChromeDriver, Mocha and unused Airbnb/import lint
packages are removed from the active dependency graph. Desktop start/build
scripts and electron-builder configuration are retired now as part of replacing
the tooling. The legacy desktop files/shell script remain source references for
the later cleanup phase; they are not supported commands of this npm package.

The original `app/`, `main.js`, `utilities/`, `build/`, `test/spec.js` and synthetic
fixtures are retained. New ESLint flat configuration scopes correctness checks
to maintained code/tooling/tests and excludes the frozen legacy implementation.
The latter is exercised by its characterization tests, including known defects.
`test/characterization/package.json` keeps those existing scripts in CommonJS
under the otherwise ES-module package.

New TypeScript uses strict checking, unchecked-index and optional-property
checks, unused-symbol checks, and type-aware lint rules. Components do not use
raw HTML injection; lint rules reject dangerous HTML props/sinks and dynamic
code evaluation in maintained TypeScript. Prettier covers maintained files and
excludes the historical source, fixtures and Phase 0 records to avoid unrelated
format churn.

## Manifests and identity

WXT emits a Chromium service worker and Firefox background scripts from the same
background entrypoint. The MV3 `_execute_action` shortcut is retained. The options
entrypoint explicitly sets `manifest.open_in_tab` in HTML metadata; WXT otherwise
overrides the manifest option with its default of false.

- Chromium capability floor: 120, chosen to align with later alarm recovery.
- Firefox capability floor: 142, compatible with the current data-permission
  declaration validation. This is not a new promise to test unsupported historical
  Firefox releases or support Android.
- Firefox ID: `{c5b32a48-5514-4a46-81f2-075ebf3cbc29}`, directly confirmed by the user.
- No `tabs`, `storage`, host or menu permission is requested by this foundation.
  Add only the permissions needed when the corresponding features are implemented.
- Bundled scripts use a self-only CSP without inline/eval execution. Fonts are
  system fonts; no external stylesheet or font request is introduced.
- Firefox declares required data collection `none` for this current no-transmission
  preview. Search, sync and other future features require a renewed declaration
  review before release; the declaration must describe the actual completed app.

Chrome/Edge store signing keys are not invented or committed. Ordinary unpacked
Chromium IDs can depend on the local path and do not establish a same-ID store
upgrade. Keep the existing listings and perform genuine signed upgrade testing
in the later release phase. Firefox's fixed ID likewise does not establish a
successful upgrade merely because a development package compiles.

## Validation commands

```sh
npm ci
npm run validate
```

`validate` runs TypeScript, ESLint, formatting, Vitest, the 49 legacy checks, both
builds, generated-output checks and Mozilla validation. Unit tests cover internal
routing and the Mozilla-warning review gate. No tests load the user's private
export; all test content is synthetic.

Generated-output checks validate version/identity, background shape, shortcut,
options page, permission scope, local script/style references, CSP, icon
dimensions and absence of legacy/test/private directories. JavaScript source
maps are included for debugging and attribution of vendor findings. Structural
checks do not establish all possible runtime security properties.

### Mozilla's Preact finding

Mozilla's linter flags Preact's renderer because the framework internally
supports `innerHTML`. The application does not use that feature. The validation
wrapper uses Mozilla's public Node API, source maps and a narrow review policy:

- Zero errors, zero unreviewed warnings and zero unreviewed notices are required.
- At most one `UNSAFE_VAR_ASSIGNMENT` warning is accepted, only when the generated
  location maps to `node_modules/preact/dist/preact.mjs` in pinned Preact 11.1.1.
- Missing source-map evidence, the same warning in application code, new warning
  codes, additional findings or a renderer version change fail the check.
- Negative unit tests verify those rejection paths. A broad ignore-code flag is
  not used. Updating Preact requires reviewing the exception again.

Using the API also avoids the CLI's unrelated update-notifier configuration
access in the user's home directory. The accepted vendor warning remains visible
in command output and is not described as a warning-free Mozilla result.

## Dependency findings

The new graph removes the legacy Electron/Spectron dependency chain. Compatible
updates to brace-expansion 1.1.21 and picomatch 2.3.2 resolve the high-severity
advisories initially retained by the old lockfile. No forced major-version
downgrade or incompatible override is used.

The full development-tool audit still reports a moderate minimatch glob-amplification
advisory (`GHSA-g3hv-75wg-m249`) and a low deepmerge prototype-poisoning advisory
(`GHSA-gcqx-w48m-w2h4`), including their affected parent packages. These operate in
development/validation tooling and are not included in the generated extension.
The recorded full audit contains 18 affected package entries (17 moderate and
one low, including parent-package propagation), with no high/critical entries.
The runtime-only audit reports zero advisories. CI gates new high/critical
dependency findings; the remaining lower-severity tooling findings still need
review/remediation before publication.
Mozilla's current addons-linter also depends on end-of-support ESLint 9 while the
project's own lint uses supported ESLint 10. These upstream issues remain tracked
for review/remediation; compilation success is not a claim that all tooling is
advisory-free. Re-run audits as packages change and before publication.

## Runtime and release limitations

This environment has Chromium 154 with an administrator-managed extension
blocklist (`ExtensionInstallBlocklist: ["*"]`) and has no Firefox installation.
The policy is not changed or bypassed. No real Chromium extension UI pass,
Firefox runtime pass, signed-upgrade result, accessibility pass or cross-device
sync result is claimed here.

Use an isolated local development profile to inspect the scaffold. Do not load
the fixed-ID Firefox build over the normal installed add-on as a substitute for
a backed-up profile test. No migration has run and no installed-user data was
modified by this phase. Phase 2 must establish verified backups and migration
before any new entrypoint performs user-data writes.

## Recorded local evidence

- A clean `npm ci` succeeded in a separate directory with no existing dependencies
  or generated types. Electron is not downloaded or required.
- `npm run validate` passed there: strict TypeScript, type-aware ESLint, formatting,
  16 Vitest tests, all 49 preserved legacy checks, both builds, generated-resource
  verification and the documented Mozilla warning review gate.
- All 56 generated resources (28 per browser, including source maps) were
  byte-identical to the main workspace's outputs after that clean rebuild.
- Git diff verification confirms that legacy application/desktop source,
  characterization code and storage fixtures are unchanged. A small package
  boundary preserves the legacy tests' CommonJS execution.
- Privacy review found none of the supplied private export identifiers, personal
  destinations or list labels in proposed public files or generated artifacts.
- The exact hosted workflow results must be inspected for the published phase
  commit. Local checks do not by themselves establish a hosted CI result.
