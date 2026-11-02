# Phase 5: Accessibility and browser hardening

Work in progress from `efcb4497219a7ffa7b4562a69ccbdb8c7204c931` on
`redevelopment`. This record distinguishes implementation, mocked checks and
real browser evidence. It is not a release approval.

## Private-session implementation

- The authenticated page router resolves the actual sender window before
  choosing regular or private services. Page/operation authorization precedes
  storage access. Action popups supply their originating window in an envelope;
  a real sender tab takes precedence over that hint.
- Private work uses an isolated `storage.session` adapter under
  `buo:private:v1:`. The existing canonical coordinator and job services run on
  that adapter, with a separate writer lock, runner lock and recovery alarms.
- A schema-3 session baseline copies regular saved lists/preferences once, not
  regular drafts, staging or history. Regular migration/mutation records remain
  schema 1/2. Private edits do not change regular saved data.
- A private-session ID binds every adapter read/write. Last-window cleanup shares
  the writer lock and clears the namespace and private alarms. Old callbacks
  cannot write into a new private session. Joining private windows retain the
  same session; disjoint window sets after a missed cleanup start a fresh one.
- The browser must grant private access. A visible private-session notice explains
  temporary changes. Startup and sync remain regular; the global context menu
  uses regular saved lists, including when opened into a private window. Its
  private-only counterparts are disabled in private preferences.
- Explicit file/clipboard exports can outlast the private session. Session storage
  clears on browser restart/extension reload, so it does not promise recovery
  across those events.

Sources: `src/application/page-router.ts`,
`src/application/storage/session-workspace.ts`,
`src/infrastructure/browser/private-workspace.ts`,
`src/infrastructure/browser/opening.ts`, `src/application/services.ts` and
`src/entrypoints/background.ts`. `test/unit/private-workspace.test.ts` covers
namespace isolation, interruption, concurrency, cleanup and authorization.

## Browser test setup

`test/browser/extension.test.mjs` runs the actual built extension through Selenium
in new disposable profiles. `.github/workflows/browser.yml` exercises Chrome
stable, Firefox stable and Firefox ESR on Linux. Destinations use an in-process
loopback server and all data is synthetic. Evidence artifacts exclude profiles.

Local Chromium has an extension-blocking administrative policy and Firefox is
absent. The harness refuses the managed Chromium installation; testing uses
unmanaged CI browsers. Chrome uses its matching SUID sandbox helper on Ubuntu;
the sandbox is not disabled. Firefox's driver receives explicit system access
for extension-page navigation in the controlled test profile.

Initial Chrome smoke checks on `571d6af00e1dc8bc2fe29c53ece1a577652fd31a`
passed actual migration, separate single-line editing, durable drafts, delayed
tab opening, receipts and capture. Firefox driver setup and expanded Phase 5
checks are still being completed. Passing mocked tests is not substituted for
their runtime results.

## Current validation and outstanding work

The private implementation passes 262 modern and 49 frozen legacy checks,
TypeScript/lint/formatting, both builds and Mozilla validation with the same
reviewed Preact warning exception. Final phase evidence will replace this
intermediate count after the browser suite is expanded.

Keyboard/semantic accessibility, zoom/reflow, large lists/quota, restricted URLs,
private runtime and worker suspension remain active work. Real account delivery
requires accounts on separate installations; a local storage.sync read-back
does not prove it. Screen-reader listening tests, additional operating systems,
secondary browser distributions and signed upgrades remain explicit release
evidence rather than implied by Linux automation.
