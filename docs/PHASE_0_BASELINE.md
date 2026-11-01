# Phase 0: Establish the baseline

Recorded 1 November 2026 on `redevelopment`. Baseline application commit:
[`4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7`](https://github.com/EuanRiggans/BulkURLOpener/tree/4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7).
All legacy `file:line` references below refer to that commit, even after later
cleanup removes or relocates those files. This phase adds no application fixes.

The previous chat's redevelopment branch/commits are considered lost. Its
reported implementations, test counts and packages are not current evidence.
The original repository's earlier Git history is available and supplies fixture
provenance. See [the plan](REDEVELOPMENT_PLAN.md) for the current user decisions,
support policy, architecture and checkpoint requirements.

## Evidence and scope

The audit inspected 73 original tracked files, 15 HTML pages and 24 JavaScript
files, including vendored scripts, styles/assets, manifests, Electron code,
package metadata, lockfile, workflows, tests and documentation. The extension
manifest is version 1.12.1; npm metadata is 1.12.0.

**Confirmed** means source inspection or deterministic in-memory reproduction.
**Potential** means runtime/external testing is still needed. **Optional** means
an architectural/presentation improvement rather than a defect. A successful
VM test does not establish browser compatibility or complete UI behaviour.

## Current structure and execution

| Location | Responsibility |
| --- | --- |
| `app/manifest.json` | MV3 action popup, options page, service worker, permissions and shortcut. |
| `app/popup.html`, `app/js/main-interface.js` | Textarea, capture, list controls, initial content and navigation. |
| `app/js/utility.js` | Global URL rules, storage, settings, snapshots, HTML generation and platform adapters. |
| `app/service-worker.js` | Startup opening from separate settings/list mirrors; duplicates URL/browser helpers. |
| `app/openingtabs.html`, `app/js/openingtabs.js` | Document-owned delayed execution, pause/resume and remaining URLs. |
| `app/delayedloading.html`, `app/js/delayedloading.js` | Focus-triggered navigation to a URL encoded in a placeholder tab. |
| `app/pages/lists/`, `settings/`, `data-control/` | Separate editors, settings and JSON transfer. |
| `app/pages/help/`, `faq/`, `changelog/`, `debug/` | Navigation, sync/recovery, update check, supporting information and settings diagnostics. |
| `app/pages/tools/` | Extract-first-URL-per-line and reverse-lines tools. |
| `app/js/custom-styles.js`, `breadcrumb.js` | Appearance and Electron navigation handling. |
| `app/css/`, `fonts/`, `icon/` | Bootstrap/jQuery-related UI assets, themes and correctly sized extension icons. |
| `main.js`, `utilities/`, `build/` | Electron lifecycle/CLI and desktop icons; intentionally retired later. |
| `package*`, `test/spec.js`, `unstable-build-script.sh` | Desktop-oriented dependency/build tooling and one launch test. |
| `.github/`, root docs | Automation, templates, install instructions, history, privacy and licensing. |

The scripts are classic globals loaded in a fixed order (`app/popup.html:63`).
Pages primarily read/write `localStorage`. Selected utility paths write
`storage.local` mirrors (`app/js/utility.js:302`, `app/js/utility.js:910`); the
worker reads them on startup (`app/service-worker.js:23`). There are no content
scripts or general webpage DOM access. Tabs, windows, runtime URLs/metadata and
storage are the main extension APIs.

## Functionality and acceptance inventory

The table is the parity checklist. A feature's presence in source does not
establish it currently works in every browser; defect references follow below.
Electron-specific behaviour is the deliberate exception to preservation.

| ID | Existing capability | Acceptance for the redevelopment | Legacy source |
| --- | --- | --- | --- |
| F01 | Paste/type newline-separated entries and open a batch. | Keep quick textarea entry, order and explicit feedback for rejected entries. | `app/js/main-interface.js:122`, `app/js/main-interface.js:200` |
| F02 | Non-URL policy: search, ignore or extract. | One policy for popup, saved lists, startup and menu opening; no malformed prefix rewriting. | `app/js/utility.js:83` |
| F03 | Google, DuckDuckGo, Bing selection. | Preserve provider choice; encode query values safely and use HTTPS search endpoints. | `app/js/utility.js:222` |
| F04 | Capture current-window or all-window tab URLs. | Preserve both scopes and give useful permission/restricted-tab feedback. | `app/js/main-interface.js:129` |
| F05 | Clear current textarea. | Keep a simple clear action; define persistence of the cleared draft consistently. | `app/js/main-interface.js:191` |
| F06 | Create, edit, load and delete lists. | Preserve names and lines; safe validation/commit; creation/editing stay on separate pages. | `app/pages/lists/newlist.js:21`, `app/pages/lists/editlist.js:19`, `app/js/main-interface.js:308` |
| F07 | Auto-load selected list into textarea. | Preserve the independent setting and predictable selection behaviour. | `app/js/main-interface.js:47` |
| F08 | Auto-open selected list and temporary override. | Preserve both while preventing editing/deletion from accidentally opening a batch. | `app/js/main-interface.js:60` |
| F09 | Initial current tabs, previous typed entries, or a saved list. | Preserve all three choices and remap saved IDs during migration. | `app/js/main-interface.js:80` |
| F10 | Persist typed draft. | Preserve Unicode, query encoding, newline intent and recoverable unsaved input. | `app/js/main-interface.js:471` |
| F11 | Fractional-second tab delay. | Preserve active short-delay execution; persist progress and recover after interruptions. | `app/pages/settings/index.html:48`, `app/js/openingtabs.js:19` |
| F12 | Pause/resume and remaining-URL display. | Keep a dedicated progress view with accurate pending state and visible failure/recovery. | `app/js/openingtabs.js:38`, `app/js/openingtabs.js:51` |
| F13 | Load destinations when selected. | Preserve inactive placeholder behaviour, exact destination encoding and controlled navigation. | `app/js/utility.js:103`, `app/js/delayedloading.js:9` |
| F14 | Open a selected list on browser start. | Use migrated canonical data, handle missing/deleted lists and apply the same opening rules. | `app/service-worker.js:23` |
| F15 | Reverse and automatic duplicate removal. | Preserve user control and stable order; document whitespace handling; apply consistently to every trigger. | `app/js/main-interface.js:202`, `app/js/utility.js:778` |
| F16 | New-tab activation preference. | Preserve final-tab activation semantics without destroying a still-running popup; align delayed/startup/menu paths. | `app/js/utility.js:117` |
| F17 | Separate main window and keyboard shortcut. | Retain both with correct MV3 command and accessible controls. | `app/js/main-interface.js:449`, `app/manifest.json:30` |
| F18 | Night mode, Bootstrap/Fluent and four button styles. | Retain equivalent choices through documented token/preset mapping; normalize typo aliases. | `app/js/custom-styles.js:34`, `app/pages/settings/settings.js:290` |
| F19 | Settings autosave and explicit save. | Preserve values and display success only after a successful write. | `app/pages/settings/settings.js:199`, `app/pages/settings/settings.js:217` |
| F20 | JSON export/import. | Accept historical payloads and retain copy/paste; validate and keep recovery before replacement. File transfer may complement it. | `app/pages/data-control/export.js:27`, `app/pages/data-control/import.js:27` |
| F21 | Manual browser-account upload/restore with preview. | Keep explicit sync, quota/error feedback and a stable reviewed payload before replacement. | `app/pages/help/help.js:150`, `app/pages/help/help.js:173` |
| F22 | Automatic snapshots, restore, disable and purge. | Preserve recoverable historical backups; bounded new retention; intentional destructive controls. | `app/js/utility.js:818`, `app/js/utility.js:887`, `app/pages/help/help.js:315` |
| F23 | Extract URLs and reverse a list. | Keep both standalone tools; fix extraction limitations deliberately. | `app/pages/tools/extractor.js:16`, `app/pages/tools/reverse.js:16` |
| F24 | Help, FAQ, release history, source/issues links and update information. | Retain useful destinations and working update/version guidance; review the external version endpoint. | `app/pages/help/help.js:9`, `app/pages/help/help.js:125`, `app/pages/faq/index.html:23` |
| F25 | Settings diagnostic output. | Keep useful diagnostics with explicit user review; avoid silently including personal lists/drafts. | `app/pages/debug/get-info.js:27` |
| F26 | Historically available, currently disabled context menus. | Implement the user's exact `Bulk URL Opener > Open Lists > [saved lists]` hierarchy through shared services. | `CHANGELOG.md:6`, `app/pages/settings/settings.js:97` |

The supplied screenshot reinforces the simple main textarea/actions/list-row
concept. Visual layout, labels and grouping can improve; editors, settings grids,
sync and recovery interfaces must stay outside the popup. No new UI is shipped
in Phase 0. New architecture may correct legacy defects without preserving
malformed URLs, unsafe DOM rendering or destructive save behaviour.

## Exact settings and migration meanings

All current defaults are captured in `test/fixtures/legacy/default-settings.json`
and checked by executing `createSettings()`. Source: `app/js/utility.js:646`.

| Setting | Current browser default | Values/meaning to preserve |
| --- | --- | --- |
| `tab_creation_delay` | `0` | Non-negative seconds, including decimal values. |
| `night_mode` | `0` | Numeric 0/1 in legacy records. |
| `auto_open_lists` | `0` | Numeric 0/1; selection can open a batch. |
| `default_list_open` | `-1` | -1 current tabs; -2 previous input; otherwise numeric saved-list ID. |
| `custom_theme` | `defaultBoostrap` | Historical misspelling; also `fluentDesignBootstrap`. Recognize corrected alias `defaultBootstrap` safely. |
| `currently_opened_tabs_display` | `currentWindow` | Also `allOpenedTabs`. |
| `non_url_handler` | `searchForString` | Also `ignoreString`, `attemptToExtractURL`. |
| `search_engine` | `googleEngine` | Also `duckduckgoEngine`, `bingEngine`. |
| `new_tabs_active` | `0` | Current immediate path activates the final tab when enabled. |
| `auto_load_into_textarea` | `0` | Numeric 0/1. |
| `button_look` | `alwaysOutline` | Also `alwaysFilled`, `filledNight`, `filledLight`. |
| `open_on_launch` | `no_list` | Otherwise a selected saved ID, typically stored as a string. |
| `load_on_focus` | `0` | Numeric 0/1; placeholder tabs defer destination loading. |
| `context_menu_enabled` | `0` | Stored preference remains although current UI/functionality is disabled. See fresh-install policy in the plan. |
| `open_urls_in_reverse_order` | `0` | Numeric 0/1. |
| `automatically_remove_duplicate_urls` | `0` | Numeric 0/1; legacy deduplication compares raw strings before trimming. |
| `disable_snapshots` | `0` | Numeric 0/1. |

Settings records additionally carry `object_description: "user_settings"`.
Older versions have fewer fields. Do not replace an entire historical record
with defaults merely because some fields are absent. Preserve unknown data in
raw recovery artifacts even where it cannot be made active safely.

## Storage inventory and historical evidence

| Store/key | Representation and purpose | Source |
| --- | --- | --- |
| `localStorage.settings` | JSON settings object; old profiles can contain comma strings. | `app/js/utility.js:302`, historical `842a842:js/lists.js:8` |
| UUID-named local keys | JSON lists with `object_description`, numeric `list_id`, `list_name`, `list_links`. | `app/js/utility.js:274` |
| Numeric local keys | Older JSON saves, current import/restore; coexistence with UUID keys is possible. | Historical `4f511a4:app/js/utility.js:260`, `app/pages/data-control/import.js:73` |
| `maxID` | String counter; observed code also anticipates the string `NaN`. | `app/js/utility.js:348` |
| `previous_list_input` | JSON array of draft lines. | `app/js/main-interface.js:471` |
| `temp` | JSON object marked `temp_storage`; transferred to the new-list page. | `app/js/main-interface.js:272` |
| `linksToOpen` | JSON object marked `link_to_open`; one batch staging key, removed at runner start. | `app/js/main-interface.js:219`, `app/js/openingtabs.js:29` |
| `storage_snapshots` | Object with `backups` array; each backup is a JSON string containing snapshot ID/time and an export. | `app/js/utility.js:818` |
| `storage.local.userSettings`, `storage.local.lists` | Structured worker copies; not a reliably current source of truth. | `app/js/utility.js:307`, `app/js/utility.js:910` |
| `storage.sync.user_settings` | One JSON string containing `{maxID, lists, settings}`. | `app/pages/help/help.js:150` |

The export omits drafts, staging and snapshots. Existing snapshots retain up to
five full exports (`slice(-4)` plus the new backup), despite documentation saying
four (`app/js/utility.js:840`, `CHANGELOG.md:12`). Draft and recovery preservation
therefore requires more than simply running the old export function.

Older source at `842a842:js/lists.js:1` writes arrays directly to localStorage;
JavaScript coerces them to comma strings and the old reader splits commas.
`53596c1:js/newlist.js:17` uses an even older ID-first sequence. Literal commas
are irreversibly ambiguous in those encodings. Current conversion cannot match
its multi-character marker against a string's first character, and the utility
initializer can fail before conversion even runs (`app/js/main-interface.js:493`,
`app/js/utility.js:172`). See the [fixture catalogue](../test/fixtures/legacy/README.md).

Migration requirements:

- Read raw document storage from an extension document; Chromium workers cannot
  access `localStorage`. Gate every new mutation/startup/menu path appropriately.
- Capture both document storage and worker mirrors before choosing defaults.
  Retain conflicting and mirror-only content; no timestamp proves precedence.
- Validate individual entries, normalize known aliases/types, remap IDs and their
  setting references, and quarantine ambiguity/corruption without erasing raw data.
- Stage a versioned candidate, write/read back and compare full content before a
  completion marker. Support retries/interruption and verified rollback.
- Keep original keys/recovery data for an agreed release period. Avoid duplicate
  migration when multiple entrypoints open or the background restarts.
- Preserve store identities and test real upgrades. An ordinary unpacked install
  under another ID cannot establish installed-user migration success.
- Retain manual sync, but handle its per-item quota and freeze the accepted preview
  payload. A local sync read-back does not prove cross-device delivery.

## Confirmed defect register

These findings are recorded for correction in the relevant later phase, not
fixed here. `defects.test.js` contains 19 passing demonstrations of observed
failures; other rows are established directly from source/resource inspection.

| ID | Finding | Evidence/source |
| --- | --- | --- |
| D01 | Editing deletes the original before validating; one URL without a newline is rejected. | `app/pages/lists/editlist.js:22`, `app/pages/lists/editlist.js:42` |
| D02 | Clearing mutates a forward-indexed store and skips keys. | `app/js/utility.js:896` |
| D03 | Import/sync/snapshot replacement clears data before validating and successfully committing replacements. Imported IDs become arbitrary storage keys. | `app/pages/data-control/import.js:51`, `app/pages/data-control/import.js:73`, `app/pages/help/help.js:273`, `app/pages/help/help.js:344` |
| D04 | Saving an edited old ID lowers maxID; later numeric identities can collide. | `app/js/utility.js:277`, `app/js/utility.js:411` |
| D05 | Deletion and direct imports/restores do not update both worker mirrors. | `app/js/utility.js:360`, `app/pages/data-control/import.js:63`, `app/pages/help/help.js:355` |
| D06 | Invalid import JSON continues into a TypeError; malformed stored values abort unguarded scans. | `app/pages/data-control/import.js:33`, `app/js/utility.js:843`, `app/js/utility.js:914` |
| D07 | A failed list save still reports success; sync ignores runtime.lastError. | `app/js/utility.js:279`, `app/js/utility.js:285`, `app/pages/help/help.js:168` |
| D08 | Worker search calls undefined getSetting. Empty batches access a missing first entry. | `app/service-worker.js:260`, `app/service-worker.js:92`, `app/js/main-interface.js:255` |
| D09 | New-list name validation repeats the URL-field condition. | `app/pages/lists/newlist.js:38` |
| D10 | Recognized FTP/Chrome schemes gain an HTTP prefix; extraction fallback is unreachable; query encoding uses encodeURI. | `app/js/utility.js:76`, `app/js/utility.js:143`, `app/js/utility.js:244`, `app/js/utility.js:225` |
| D11 | Deferred navigation decodes query content twice; editor URLs interpolate unencoded names. | `app/js/utility.js:446`, `app/js/delayedloading.js:16`, `app/js/main-interface.js:419` |
| D12 | Startup ignores duplicate-removal preference; delayed opening misses final-tab activation and removes recovery staging immediately. | `app/service-worker.js:53`, `app/js/openingtabs.js:29`, `app/js/openingtabs.js:70` |
| D13 | User-controlled names/values enter HTML templates and element IDs. CSP limits script execution; exploitability is not established by this audit. | `app/js/utility.js:582`, `app/js/main-interface.js:95`, `app/pages/settings/settings.js:158`, `app/pages/help/help.js:539` |
| D14 | Command uses MV2 name; manifest has only a Chromium worker background and lacks Firefox signing ID. | `app/manifest.json:12`, `app/manifest.json:31` |
| D15 | 28 inline Electron compatibility blocks conflict with default extension CSP. | `app/popup.html:55`, `app/pages/settings/index.html:260` |
| D16 | Global API detection differs by context; controller/storage/browser/UI responsibilities are tightly coupled. | `app/js/utility.js:38`, `app/service-worker.js:209`, `app/js/utility.js:360` |
| D17 | Dark-mode live preview uses a nonexistent relative path; theme aliases disagree; popup loads Bootstrap before jQuery. | `app/pages/settings/settings.js:181`, `app/js/custom-styles.js:22`, `app/popup.html:61` |
| D18 | Popup icon handlers sit on child icons, selector lacks a label, settings label and recovery heading references are wrong. | `app/popup.html:20`, `app/popup.html:42`, `app/pages/settings/index.html:161`, `app/pages/help/index.html:128` |
| D19 | CSS imports remote fonts and references missing font assets. Fixed widths/heights require zoom testing. | `app/css/style.css:1`, `app/css/style.css:24`, `app/css/fluent.css:15`, `app/css/font-awesome.min.css:4` |
| D20 | Prototype trim override and undeclared output global; lint correctness rules disabled. | `app/js/main-interface.js:542`, `app/pages/help/help.js:433`, `.eslintrc.json:31` |

## Security, dependencies and tooling

Permissions are only `tabs` and `storage` (`app/manifest.json:8`). Reading all
current-window/all-window tab URLs justifies `tabs`; replacing it with activeTab
would lose that capability. Opening user-chosen tabs alone needs no broad host
access. Add alarms/contextMenus only with the future features using them.

No authored eval-based loader, content scripts or remote JavaScript are present.
Keep bundled scripts and the default/stricter CSP while replacing unsafe HTML
construction. Validate allowed destinations for tab creation and clickable job
previews (`app/js/openingtabs.js:57`). Google search and bare-URL defaults use
HTTP (`app/js/utility.js:78`, `app/js/utility.js:225`). Preserve explicit HTTP/local
destinations while choosing modern defaults deliberately.

The update endpoint lacks host permissions (`app/pages/help/help.js:127`), so
success depends on normal CORS; failure is potential rather than proven solely
by the manifest. Redirected support links and Google Fonts make external
requests. The privacy policy's single sentence does not explain local storage,
browser-account sync, tab access, searches, exports or those requests
(`privacy-policy.md:3`). Review actual store definitions before declaring data
collection categories. No particular malicious data collection is established.

Electron enables nodeIntegration (`main.js:16`); remove that desktop capability.
Remove Electron 20.2.0, Spectron 19.0.0 and its Electron ChromeDriver 17.0.0, plus
desktop scripts/icons/CLI during cleanup (`package-lock.json:1346`,
`package-lock.json:1364`, `package-lock.json:4017`). Replace Mocha's single desktop
test with extension-focused testing; Mocha itself is not inherently invalid.

Vendored UI versions are jQuery 3.5.1, Bootstrap 4.5.3, Fluent Bootstrap 4.0.0 and
Font Awesome 4.7.0. Replace with the new UI/CSS/SVG assets while preserving
preferences and licences. Upgrade ESLint 8.23.1; Airbnb base/import plugin are
declared but not used by the current configuration. The npm lockfile's 440
package entries are development tooling; vendored assets need separate scanning.
No fresh registry audit is claimed: the audit's registry request was unavailable.
During the Phase 0 push on 1 November 2026, GitHub reported **123 vulnerabilities
on the default branch: 44 high, 64 moderate and 15 low**, with a link to the
[repository's Dependabot alerts](https://github.com/EuanRiggans/BulkURLOpener/security/dependabot).
This is GitHub's default-branch report, not a newly executed audit of this branch
or proof that every alert is shipped in the extension. Dependency triage/removal
remains necessary in the browser-only tooling/cleanup work; Phase 0 changes no
dependency versions.

Retain npm/lockfile, dependency update automation, Firefox tooling and static
analysis. Modernize existing CI: `braches` typo, Node 12, old checkout/setup-node
and CodeQL v1 (`.github/workflows/lint.yml:6`, `.github/workflows/lint.yml:12`,
`.github/workflows/codeql-analysis.yml:37`). Release scripts depend on undeclared
global electron-builder/web-ext and disagree on versions (`package.json:12`,
`unstable-build-script.sh:37`). Source licence is MIT but package says ISC
(`LICENSE:1`, `package.json:31`). Desktop README metadata and duplicated changelog
maintenance should be updated after browser-only builds exist.

## Potential failures needing runtime tests

- MV3 worker/event-page suspension, browser startup and interrupted jobs. Timers
  and globals are not restart-safe (`app/service-worker.js:8`, `app/service-worker.js:102`).
- Multiple opening pages competing for one staging key, and simultaneous editors
  allocating the same numeric ID (`app/js/main-interface.js:227`, `app/js/utility.js:411`).
- Sync preview changing before acceptance because acceptance fetches again
  (`app/pages/help/help.js:174`, `app/pages/help/help.js:246`).
- Permission denials, file/browser-internal schemes, private-window access,
  close-button behaviour and focus timing (`README.md:36`).
- Actual DOM injection impact, keyboard/screen-reader operation, contrast,
  reduced motion and zoom/layout behaviour.
- Same-ID signed upgrades, large/malformed installed profiles, offline operation
  and actual cross-device delivery. A temporary install under another ID is not
  a genuine upgrade test.

## Phase 0 validation

Use Node.js 24. The baseline runner uses built-in node:test and VM contexts, so
it requires no installed dependencies, network access, browser or Electron:

```sh
npm run test:baseline
```

It executes current authored source files in fresh memory-only contexts. Element
and API doubles capture calls; deterministic timer queues allow pause/resume and
ordering checks. They never create browser tabs, touch a real profile or contact
fixture destinations. They intentionally do not render/parse HTML or model
permissions, CSP, service-worker suspension or sync servers.

Local validation: **47 checks pass**, consisting of 19 explicitly labelled defect
demonstrations and 28 other behaviour/fixture checks. Existing ESLint passes with
cache disabled; its disabled correctness rules remain a documented limitation.
Nine JSON fixtures include seven raw profiles, exact defaults and an export.
Historical fixture shape checks are not tests of a new migration implementation.

The new `Legacy baseline` GitHub workflow runs these checks on Node 24 on pushes
to redevelopment and PRs targeting master, without downloading Electron. Action
versions are pinned to verified commit SHAs. Local success does not establish a
hosted Actions result; inspect the corresponding run after publication.

Hosted evidence for the initial Phase 0 checkpoint
[`627b5a7`](https://github.com/EuanRiggans/BulkURLOpener/commit/627b5a7132a7a7c65979fdd0dbe5fdf15dabe9f8):
the [Legacy baseline run](https://github.com/EuanRiggans/BulkURLOpener/actions/runs/41336812095)
and [existing lint run](https://github.com/EuanRiggans/BulkURLOpener/actions/runs/41336812004)
both completed successfully. The GitHub branch API independently confirmed that
commit as the remote head before this documentation-only follow-up.

The legacy `npm test` still runs the Spectron launch test and remains separate.
No current desktop-launch, real-browser, signed-upgrade or remote-sync pass is
claimed. No release package or redesigned UI is produced in Phase 0.

Before the phase checkpoint, review the diff and verify no changes under app/,
desktop sources or dependency versions. Commit/push to redevelopment and compare
the actual GitHub head with the local commit, as required by the user.

## Later acceptance evidence

Track F01-F26 through the rewrite. Add corrected-domain and storage/migration
tests, including API failures, quota exhaustion, retries, conflicting data,
concurrent entrypoints and interrupted writes. Use real Chromium extension
integration and Firefox-specific loading/testing; Playwright's general Firefox
support alone does not establish extension test coverage. Run accessible UI
checks and manual keyboard/screen-reader flows.

Final verification must compare list contents, names, settings, draft/recovery
availability and references after same-identity upgrades, not only record counts.
Verify generated manifests/resources, dependency advisories and reproducible
source/distribution archives after final cleanup. Keep release approval distinct
from source/build validation and from authorization to work on this phase.
