# Release checks beyond Linux automation

These checks use synthetic data and disposable, backed-up installations. They
are release gates, not a request to expose account credentials, profiles or
personal exports in an issue or this public repository. The Phase 5 browser
suite runs without signed-in browser accounts.

## Transfer and legacy account-cache recovery

Browser-account sync uploads and snapshot capture were removed after Phase 7.
The earlier remote-delivery protocol is historical and is no longer a release
gate. Use two backed-up installations to check JSON export/import, including
Unicode, exact URL/query/newline content and all preferences. A preview must not
replace data before explicit review; replacement must retain current drafts/jobs
and never replay imported jobs.

Where a previous account cache exists, inspect and restore it locally. Confirm
all sync keys remain unchanged and no upload/optional-settings-consent controls
are present. No remote provider-delivery claim is made. Verify a downloaded full
recovery archive by reading it back before optional preview-history compaction;
follow the [current storage contract](STORAGE_SIMPLIFICATION.md).

## Assistive technology and native browser controls

Use current NVDA with Firefox/Chrome on Windows, VoiceOver with a supported
browser on macOS, and Orca on Linux where available. Record the actual versions
and observations; automated axe rules cannot establish spoken usability.

- Navigate the popup by keyboard: initial URL field, Open links, Get current
  tabs, Clear, saved-list controls and More. Check visible focus and a usable
  order. Clear returns focus to the textarea. Editors open on separate pages.
- Listen for field labels, save/error/status messages, opening progress, stale
  edit feedback, transfer-review focus and the private-session notice. Read a
  long list and import preview; content should be accessible without a mouse.
- Exercise 200% and 400% zoom, OS high contrast/forced colours and enlarged text.
  Check focus is visible, controls remain reachable and text is not clipped.
  Test an actual action popup too: a full tab rendering the same page does not
  prove the browser's popup size constraints or close-on-blur behaviour.
- Enable the context menu and use an ordinary web page's native right-click
  menu. Verify exactly `Bulk URL Opener > Open Lists > [saved lists]`, including
  list rename/delete and a background restart. Open from a private window:
  regular saved names remain the global menu, and tabs open privately.
- Configure/use the action shortcut through native browser settings. Open the
  separate opener window. Check keyboard conflicts and window focus on each OS.

## Remaining platform and upgrade coverage

Repeat key flows on Windows/macOS, previous stable Chrome/Edge and current Edge;
check Opera, Brave and Vivaldi as secondary distributions. Linux Chrome/Firefox
automation alone does not establish those results. Exercise native clipboard
and downloaded-file UX, private-access refusal, private multi-window cleanup,
browser restart and restricted file/browser pages under each browser's policy.

Same-identity, genuinely signed upgrades from published versions are Phase 7.
The [Phase 7 upgrade protocol](UPGRADE_VERIFICATION.md) now supplies a private
baseline capture and read-only comparison command; same-ID development updates
are automated separately and do not satisfy this signed-upgrade gate.
Use copied/backed-up profiles; do not uninstall the existing add-on. Compare
all historical list/settings data, drafts and retained recovery sources after
upgrade. An unpacked development profile with an empty legacy store cannot
establish preservation of an installed user's data.

Ordinary save history is now bounded and repeated large-library saves are tested.
Active data, original migration backups, damaged records and unresolved work can
still fill finite storage. Test recovery/archival on signed upgrades; no test
establishes unlimited capacity or safe opening of thousands of live tabs.
