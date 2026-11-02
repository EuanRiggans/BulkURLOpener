# Bulk URL Opener

A browser extension for opening URLs and searches in batches and managing saved lists.

**The `redevelopment` branch is a development preview.** Phase 4 connects the simple popup, separate list editors, all preferences, transfer/sync, snapshots, tools and help to the verified shared services. Use an isolated development browser profile; real browser hardening and signed-upgrade verification are still required before a release.

The popup stays focused on URL entry and simple actions. Creating and editing lists use separate pages. The context menu is `Bulk URL Opener → Open Lists → [saved lists]`; enable it in Settings for an existing profile. Fresh installations enable the basic menu. Settings, Data & recovery, Tools, Help and Opening jobs have full pages.

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
src/entrypoints/              Background and nine bundled extension pages
src/infrastructure/browser/  Browser API adapters
src/application/storage/     Serialized migration/recovery coordinator and protocol
src/application/opening/     Shared planning, execution and startup services
src/application/workspace.ts Drafts, reviewed transfer/sync and snapshots
src/domain/storage/          Typed schemas and pure legacy reconciliation
src/domain/opening/          URL policy and typed job model
src/shared/                  Pure internal navigation helpers
src/ui/                      Preact pages/components, form flows and local CSS
public/icon/                 Existing extension icons
test/unit/                   Modern Vitest checks
test/characterization/       Executable legacy behaviour baseline
test/fixtures/legacy/        Synthetic historical storage examples
scripts/                     Generated-build verification
docs/                        Baseline, decisions, phases and validation evidence
```

`app/` remains the untouched legacy extension reference. Desktop files (`main.js`, `utilities/`, `build/`, `test/spec.js`, and `unstable-build-script.sh`) remain historical source pending cleanup. Electron, Spectron, Mocha and desktop build/start commands are removed from the active npm toolchain. The old shell script and desktop instructions from Git history do not apply to this toolchain.

## Data and privacy

In Settings or Data & recovery, **Data protection and recovery** captures exact legacy sources, shows conflicts and migrates reviewed data. Nothing migrates on startup. Original legacy stores stay unchanged; new records are verified before activation. Migration undo is closed after normal edits or jobs exist so later work cannot be discarded.

The popup saves working text promptly to a separate verified record; conflicts and new-list handoffs are retained as immutable copies. Initial loading never auto-opens a list. Auto-load and auto-open remain separate preferences, with a temporary popup override. List saves and settings autosave use revision checks; stale edits stay visible for review. Select **Save settings** to save immediately.

Data & recovery supports portable 2.x and legacy 1.x JSON exports, paste/file import, reviewed replacement, five optional snapshots and inspection of retained legacy archives. Recovery-file imports restore lists/settings while keeping current drafts/jobs; other imported records remain in the retained original. Raw recovery downloads include all retained records and may be much larger than a normal export.

Manual browser-account sync uploads only explicitly reviewed lists/settings to a new key, preserving the legacy sync key and a local copy of previous sync contents. A conservative 8 KB item limit applies; larger libraries use JSON transfer. Read-back verifies the local sync area, not remote delivery. Chrome-family and Firefox accounts do not share a sync service.

Saved-list startup preferences use the same opening policy. Jobs retain a settings snapshot and durable acknowledgements; interrupted/unconfirmed tab creation needs review instead of blind replay. Pending work from a new browser session needs an explicit target window. Settings links to staged-change and opening-job recovery.

Jobs retain URLs/search input locally and navigate to user-chosen destinations/providers. Firefox declares and checks corresponding consent before opening or uploading sync data. Private-window jobs/capture are temporarily unavailable until session-only handling is implemented. See the [privacy policy](privacy-policy.md), [Phase 3 service contracts](docs/PHASE_3_SERVICES.md) and [Phase 4 flows and limits](docs/PHASE_4_FLOWS.md).

Download a recovery file first, then choose **Inspect and back up data**. Conflicting preferences and ambiguous historical comma records require explicit choices. Storage errors block activation rather than deleting data to make room. Recovery downloads contain private data; keep them private. See [the Phase 2 contract and limits](docs/PHASE_2_DATA.md).

This is a public repository. Never commit personal exports, browser profiles, private URLs/list names or unsanitized diagnostics. All committed migration fixtures are synthetic. The Firefox add-on ID is public extension metadata.

## Redevelopment records

- [Phase 0 baseline and feature inventory](docs/PHASE_0_BASELINE.md)
- [Redevelopment decisions and roadmap](docs/REDEVELOPMENT_PLAN.md)
- [Phase 1 tooling and validation](docs/PHASE_1_TOOLING.md)
- [Phase 2 data protection and migration](docs/PHASE_2_DATA.md)
- [Phase 3 shared services and job recovery](docs/PHASE_3_SERVICES.md)
- [Phase 4 functional flows and feature parity](docs/PHASE_4_FLOWS.md)
- [Historical storage fixtures](test/fixtures/legacy/README.md)

Completed phases are committed, pushed to `redevelopment` and verified against GitHub. Source/build checks do not replace real browser, accessibility, cross-device sync or genuine signed-upgrade testing.

## Existing store listings

These links are retained from the legacy project. They do not distribute this development preview.

- [Chrome](https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep)
- [Firefox](https://addons.mozilla.org/firefox/addon/bulkurlopener/)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo)
- [Opera](https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/)

MIT licensed; see [LICENSE](LICENSE).
