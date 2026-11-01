# Bulk URL Opener

A browser extension for opening URLs and searches in batches and managing saved lists.

**The `redevelopment` branch is a development preview.** Phase 2 adds reviewed data migration and recovery on the settings page. Batch opening, normal list editing and settings editing remain unavailable. Use an isolated development browser profile; it is not a replacement for your installed extension.

The popup stays focused on URL entry and simple actions. Creating and editing lists use separate pages. The planned context menu is `Bulk URL Opener → Open Lists → [saved lists]`.

## Development

Use Node.js 24 (see `.nvmrc`) and npm.

```sh
npm ci
npm run validate
```

```sh
npm run dev           # Chromium development build
npm run dev:firefox   # Firefox development build; requires Firefox
```

Use WXT's isolated development profile or a separate disposable profile. Never uninstall your normal add-on to test an upgrade. The Firefox build deliberately retains the existing add-on ID, so loading it in your normal profile could replace that installation.

## Builds and checks

| Command                 | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `npm run build`         | Production-mode Chromium MV3 preview in `.output/chrome-mv3/`.                              |
| `npm run build:firefox` | Production-mode Firefox MV3 preview in `.output/firefox-mv3/`.                              |
| `npm run build:all`     | Build both browsers.                                                                        |
| `npm run check`         | Strict TypeScript, ESLint, formatting, Vitest and legacy characterization.                  |
| `npm run check:build`   | Check generated manifests, resources, CSP, icons and build contents. Run after both builds. |
| `npm run lint:firefox`  | Mozilla validation of the generated Firefox extension.                                      |
| `npm run validate`      | All of the above checks and both builds.                                                    |
| `npm run test:baseline` | Legacy behaviour tests using Node's built-in runner; no dependency installation required.   |

WXT generates browser-specific background configuration: a Chromium service worker and Firefox background scripts. Source version `2.0.0` comes from `package.json`; this is an unreleased redevelopment version, not a store submission.

The Phase 1 capability floors are Chromium 120 and Firefox 142. The release test policy targets current/previous Chrome and Edge stable, current Firefox stable and supported ESR. Capability floors do not establish completed browser testing.

## Project layout

```text
src/entrypoints/              Background, popup, options, new-list and edit-list
src/infrastructure/browser/  Browser API adapters
src/application/storage/     Serialized migration/recovery coordinator and protocol
src/domain/storage/          Typed schemas and pure legacy reconciliation
src/shared/                  Pure internal navigation helpers
src/ui/                      Shared Preact components and local CSS
public/icon/                 Existing extension icons
test/unit/                   Modern Vitest checks
test/characterization/       Executable legacy behaviour baseline
test/fixtures/legacy/        Synthetic historical storage examples
scripts/                     Generated-build verification
docs/                        Baseline, decisions, phases and validation evidence
```

`app/` remains the untouched legacy extension reference. Desktop files (`main.js`, `utilities/`, `build/`, `test/spec.js`, and `unstable-build-script.sh`) remain historical source pending cleanup. Electron, Spectron, Mocha and desktop build/start commands are removed from the active npm toolchain. The old shell script and desktop instructions from Git history do not apply to this toolchain.

## Data and privacy

The popup and editors keep typed text in memory. In Settings, **Data protection and recovery** can capture exact legacy sources, show conflicts, migrate reviewed data and undo migration. Nothing migrates on startup. Originals, snapshots and sync copies remain unchanged; new local records are verified before activation. Existing sync data is read for recovery, never uploaded by this phase.

Download a recovery file first, then choose **Inspect and back up data**. Conflicting preferences and ambiguous historical comma records require explicit choices. Storage errors block activation rather than deleting data to make room. Recovery downloads contain private data; keep them private. See [the Phase 2 contract and limits](docs/PHASE_2_DATA.md).

This is a public repository. Never commit personal exports, browser profiles, private URLs/list names or unsanitized diagnostics. All committed migration fixtures are synthetic. The Firefox add-on ID is public extension metadata.

## Redevelopment records

- [Phase 0 baseline and feature inventory](docs/PHASE_0_BASELINE.md)
- [Redevelopment decisions and roadmap](docs/REDEVELOPMENT_PLAN.md)
- [Phase 1 tooling and validation](docs/PHASE_1_TOOLING.md)
- [Phase 2 data protection and migration](docs/PHASE_2_DATA.md)
- [Historical storage fixtures](test/fixtures/legacy/README.md)

Completed phases are committed, pushed to `redevelopment` and verified against GitHub. Source/build checks do not replace real browser, accessibility, cross-device sync or genuine signed-upgrade testing.

## Existing store listings

These links are retained from the legacy project. They do not distribute this development preview.

- [Chrome](https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep)
- [Firefox](https://addons.mozilla.org/firefox/addon/bulkurlopener/)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo)
- [Opera](https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/)

MIT licensed; see [LICENSE](LICENSE).
