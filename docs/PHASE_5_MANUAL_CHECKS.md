# Release checks beyond Linux automation

These checks use synthetic data and disposable, backed-up installations. They
are release gates, not a request to expose account credentials, profiles or
personal exports in an issue or this public repository. The Phase 5 browser
suite runs without signed-in browser accounts.

## Remote browser-account delivery

Run independently for a Chromium account and a Firefox account. They are
different services. Use two installations under the same extension identity
and account, with extension sync enabled. Record browser/OS versions, extension
commit, elapsed delivery time and outcomes without account identifiers.

1. On installation A, save a list named `Sync example` with
   `https://one.example.test/?q=%2526` and `https://two.example.test/caf%C3%A9`.
   Choose nondefault appearance and fractional delay settings. Keep the whole
   portable payload below 8 KB. Download a local recovery file on A and B.
2. In A's Data & recovery page, review the exact upload, consent and upload.
   Its success message proves the local sync API write only.
3. In B, inspect the sync download after provider delivery. Compare every list
   identity, name, line and setting with A's portable export. Inspecting must
   leave B's active head unchanged. Accept replacement only after review.
   Confirm B's working draft/jobs remain and no URLs open during replacement.
4. Take B offline. Edit and upload a different synthetic copy on A. Reconnect
   B and inspect again. Record eventual delivery and the provider's behaviour;
   do not assume a fixed delivery deadline.
5. Keep an upload review open on A; change the remote copy through B and wait
   until A's local sync cache receives it. Accept the old review. It must
   report a changed copy and require fresh inspection. Retain both local
   recovery files; there is no distributed compare-and-swap guarantee.
6. Check that any pre-existing synthetic legacy `user_settings` sync key stays
   intact. Try a library over 8 KB: upload preview must fail visibly while
   local saved data remains usable. Confirm exports transfer between vendors.

A same-profile read-back, two unsigned installs with unrelated IDs, or a local
cache test cannot establish this result. Real service outage, account policy,
concurrent-device conflict and delivery latency remain provider-dependent.

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

Keep mandatory recovery/history retention under review as libraries accumulate.
The 5,000-entry browser check measures one synthetic save/export, not unlimited
history, disk-full resilience or the safety of opening thousands of live tabs.
