# Phase 5: Accessibility and browser hardening

Recorded 2 November 2026, from Phase 4 commit
`efcb4497219a7ffa7b4562a69ccbdb8c7204c931` on `redevelopment`. This record
distinguishes implementation, mocked checks and real browser evidence. It is
not a release approval. Legacy application/desktop files and historical
fixtures/characterizations remain unchanged; their removal belongs to Phase 6.

## Private-session implementation

- The authenticated page router resolves the actual sender window before
  choosing regular or private services. Page/operation authorization precedes
  storage access. Action popups supply their originating window in an envelope;
  a real sender tab takes precedence over that hint.
- Private work uses an ephemeral adapter under `buo:private:v1:`. Firefox uses
  `storage.session` in spanning mode. Chromium uses split mode and its isolated
  incognito IndexedDB partition: spanning mode cannot host the separate editor
  in a private tab, and Chromium shares `storage.session` between split contexts.
  The existing coordinator/job services run on those adapters with separate
  writer/runner locks and recovery alarms. Chromium's regular context never
  opens the private database; its private context never runs regular startup/jobs.
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

Sources: [page authentication and routing](../src/application/page-router.ts#L43),
[session seed](../src/application/storage/session-workspace.ts#L47),
[epoch-bound storage adapter](../src/application/storage/session-workspace.ts#L220),
[window membership and cleanup](../src/application/storage/session-workspace.ts#L261),
[browser session adapter](../src/infrastructure/browser/private-workspace.ts#L12),
[scope-bound tab effects](../src/infrastructure/browser/opening.ts#L124) and
[private background services](../src/entrypoints/background.ts#L113).
`test/unit/private-workspace.test.ts` covers namespace isolation, publication
faults, interruption, joined/disjoint windows, stale callbacks, cleanup and
authorization. Private sync/global-preference restrictions are enforced in
the background, as well as displayed in the UI.

## Accessibility and browser fixes

- Initial popup focus goes to the URL textarea once, without stealing focus
  from a user who has already selected another control. Clear restores it.
  When auto-opening is enabled, its temporary override precedes list selection
  in keyboard order. See [Popup](../src/ui/pages/Popup.tsx).
- Busy states are exposed with `aria-busy`; forms retain labelled controls,
  error/status messages and transfer-review focus. The private-session notice
  is labelled and visible. See [page layout](../src/ui/PageLayout.tsx),
  [mount/appearance](../src/ui/mount.tsx) and
  [transfer review](../src/ui/services/TransferReview.tsx).
- Light-mode borders have sufficient contrast. Full-page actions wrap, long
  saved names can shrink/wrap, and popup width accommodates the viewport's
  scrollbar at high zoom. Browser testing confirmed and fixed a small 400%
  popup overflow and Chrome's closely spaced Help links. Those links now have
  larger clickable areas. See [shared CSS](../src/ui/styles.css#L54) and
  [Help links](../src/ui/pages/Help.tsx#L131).
- Chrome service workers and Firefox event backgrounds use distinct scoped
  recovery alarms and locks. The alarm adapter accepts Firefox APIs that return
  `void` as well as promises. Held pages listen for both regular local and
  private session job updates. See
  [opening adapter](../src/infrastructure/browser/opening.ts#L110) and
  [held page](../src/entrypoints/deferred/main.tsx#L34).
- Firefox uses spanning mode and Chromium uses split mode. Both retain the same
  four permissions: `storage`, `tabs`, `alarms`, `contextMenus`. There are no
  content scripts, broad host grants or new clipboard/download permissions.
  The Firefox identity is unchanged. See [configuration](../wxt.config.ts#L9).
- Chromium's `contextMenus.removeAll` clears both split contexts. Its adapter
  now removes only the current context's `buo-root` subtree, accepting the
  expected missing-root case and surfacing other failures. Each context mirrors
  regular saved lists; private-only names never become menu entries.

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

Each artifact records the source SHA, actual browser/OS versions, assertion
summary, axe results, screenshots and the synthetic volume-save duration.
Artifacts have a 14-day lifetime; the reproducible harness and this durable
record remain in Git. Test destinations use only the loopback server; no
personal export or browser profile is uploaded.

The runtime suite checks:

1. Actual fresh-state migration, separate one-line editing and durable drafts,
   including encoded input and trailing blank lines.
2. Delayed tab creation, durable receipts and capture; keyboard focus/order and
   clearing without a mouse.
3. Nine bundled page states at actual 400% browser zoom (roughly 320 CSS pixels),
   horizontal reflow, 200% popup zoom and all 16 theme/mode/button combinations.
   Axe runs WCAG 2/2.1/2.2 A/AA rules without disabled rules. The file-import
   review is also checked. These are automated checks, not WCAG certification
   or evidence that every dynamic state has been inspected by a person.
4. Browser-granted private access, separate editor handoff, Unicode private
   drafts/list edits/jobs, private sync rejection, background restart, joined
   private windows, capture isolation and final-window session cleanup. Entire
   local/sync stores must be identical before and after private work.
5. Forced background termination after an acknowledged tab, followed by alarm
   recovery. During the wait the harness sends no extension RPC or navigation;
   its HTTP server observes remaining destinations once each. This proves
   recovery of acknowledged work, not exactly-once effects at a crash boundary.
6. Held tabs: opaque helper URLs, no initial destination request, destination
   capture and exact encoded navigation after selection. Unsafe script/data/
   extension schemes are rejected; a privileged destination's actual browser
   refusal or tab acknowledgement is recorded without adding permission.
7. Real UTF-8 file selection, escaped review content, explicit replacement and
   exact export, while retaining drafts/jobs. Reviewed manual sync upload and
   download use the real local API cache and preserve legacy sync keys. No
   account is signed in, so remote provider delivery remains untested.
8. A 5,000-entry save/export with exact comparison and oversized-sync rejection.
   Chrome additionally fills its real local quota with an isolated synthetic
   test key; a failed mutation must retain the active head/data and existing
   records. Firefox has no equivalent fixed quota constant, so that one test is
   explicitly skipped there. Injected quota/publication faults remain covered
   independently by unit tests.

## Validation and remaining release gates

Local validation covers 266 modern and 49 frozen legacy checks, strict
TypeScript, lint/formatting, both builds, generated-resource checks and Mozilla
validation with the existing single reviewed Preact warning exception.

On 2 November, `npm audit --omit=dev` reported zero runtime advisories. The full
toolchain audit reported 18 (17 moderate, one low; no high/critical), in the
existing lint/build tool graph. No blanket forced dependency upgrade was made;
dependency/legacy cleanup remains Phase 6. Selenium and axe are pinned development
dependencies and are absent from the extension bundles.

[The manual release protocol](PHASE_5_MANUAL_CHECKS.md) provides concrete steps
for real two-installation/account sync, assistive-technology listening, native
popup/menu/shortcut/clipboard/download behaviour, other OS/browser distributions
and genuine signed upgrades. Those checks are not implied by Linux automation.
Mandatory history/transfer retention can grow; the volume test does not prove
unlimited storage or safe mass opening. No store release, default-branch merge
or Phase 6 deletion is performed in this phase.
