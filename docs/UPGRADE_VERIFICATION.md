# Upgrade preservation protocol

Prepared 7 November 2026 for the unreleased `2.0.0` candidate. Use synthetic
data first, then a private copy of a backed-up installation. Nothing here
authorizes a store upload, public rollout, signing-key disclosure or uninstall.

## What is automated

`npm run test:upgrade` runs a disposable same-ID **development** update in each
browser CI job. A minimal seeding extension writes the historical
`current-profile.json` fixture into actual document/local/sync storage. It is
replaced by the candidate without uninstalling. Tests check:

- The extension origin/ID remains the same and all original sources remain
  exact. Installation does not silently migrate the library.
- Explicit reviewed migration retains both lists, all 17 preferences, assigned
  legacy IDs/references, Unicode/encoded queries, duplicate lines, working input,
  two staged inputs and the original snapshot archive.
- A second candidate installation/reload preserves canonical records and data.
  Migration/reload never replays the legacy pending destinations.
- The command-line comparison below passes on real browser captures. Only its
  result codes/counts are uploaded; temporary input files are removed.

The fixture is not a published binary. Chromium uses a stable unpacked path;
Firefox uses temporary installations with the production ID. Neither establishes
store signing, permission-update UI, profile UUID behavior for every installed
user, OS coverage or a genuine signed-candidate upgrade. Those are separate gates.

## Genuine installed-version test

1. Confirm the exact store listing, installed version, ID, OS/browser version and
   candidate commit. Verify signatures through the browser/store tooling. Keep
   the original signed package and candidate checksum privately with the evidence.
   Current public listings observed during preparation show Chrome `1.12.1`
   and Firefox `1.11.3`; confirm again when testing. Test other supported older
   versions/formats and copies with large/damaged/conflicting records too.
2. Stop live editing and opening jobs. Close the browser before making a full
   profile backup. Work on its copy, keep the normal installation untouched and
   keep another independent JSON export. Never uninstall to prepare an upgrade.
   Keep account sync stable/offline during the local preservation comparison.
3. Before updating a legacy installation, capture all three storage areas from
   the old extension's own full settings page, using its developer console.
   Verify that the selected document has the expected extension origin/ID.
   This read-only snippet downloads a **private baseline file**:

   ```js
   (async () => {
     const api = globalThis.browser || globalThis.chrome;
     const sources = {
       localStorage: Object.fromEntries(
         Object.keys(localStorage).map((key) => [
           key,
           localStorage.getItem(key),
         ]),
       ),
       storageLocal: await api.storage.local.get(null),
       storageSync: await api.storage.sync.get(null),
     };
     const url = URL.createObjectURL(
       new Blob([JSON.stringify(sources)], { type: 'application/json' }),
     );
     const link = document.createElement('a');
     link.href = url;
     link.download = 'bulk-url-opener-before-upgrade.json';
     link.click();
     setTimeout(() => URL.revokeObjectURL(url), 30000);
   })();
   ```

   Use a full recovery download as the baseline for an already migrated 2.x
   preview. A portable lists/settings export alone cannot compare drafts,
   history, damaged records or raw legacy storage. Close all old pages after
   capture so they cannot write concurrently with migration.

4. Update through the **existing** store identity and its supported signed
   update route. Temporary/unpacked replacement is useful development evidence
   only. Record the version transition and the actual browser prompts, including
   new `alarms`/`contextMenus` API grants where applicable and Firefox data
   consent. Refuse optional settings-data consent once: ordinary opening must
   remain available, sync upload must fail without changing either store.
5. In the candidate's Data & recovery page, download a recovery file before any
   migration. Compare the original areas privately; report missing data rather
   than clicking through a fresh empty initialization. Then choose **Inspect
   and back up data**, review conflicts/ambiguous historical records and migrate.
   Download a full recovery file immediately after migration. Do not edit lists,
   settings, drafts or run jobs between the baseline and this comparison.
6. On a trusted development machine run:

   ```sh
   npm ci
   npm run upgrade:compare -- /private/before-upgrade.json /private/after-recovery.json
   ```

   The command opens no browser or network listener, makes no storage writes and
   sends no files. It accepts raw three-area legacy captures or verified recovery
   envelopes as the baseline; the after-file must be a full verified recovery
   envelope. It validates the active ancestry with the application's verifier,
   compares every pre-existing record, and checks the complete canonical data
   against either the prior canonical library or the actual recorded migration
   decisions. Conflicts are not silently resolved by the checker. Empty baselines
   and lists-only exports are rejected. Exit `0` means the data checks passed;
   `1` means a difference/invalid input; `2` means incorrect command usage.
   Output contains only fixed codes, counts and scope limits. Counts can still
   be private; inspect even a summary before sharing it. Input paths appear in
   your shell/npm history, so use generic filenames outside this repository.

7. Verify lists/preferences manually, including zero/duplicate IDs, default and
   startup references, fractional delay, blank lines and encoded destinations.
   Inspect retained drafts, old snapshots, sync sources and staged inputs.
   Nothing pending from the old format may execute automatically.
8. Restart the browser with the signed candidate still installed. Download and
   compare another full recovery file against the prior canonical capture.
   Run the native menu, shortcut, popup, private-session and accessibility checks
   in [the manual protocol](PHASE_5_MANUAL_CHECKS.md). Record exact versions and
   signatures separately; a passing JSON comparison does not prove them.

## Failure and rollback

Stop rollout for any missing/changed original, unreviewed preference change,
unexpected URL opening, unverified ancestry or blocked recovery download. Keep
the original profile/package, before/after captures and verification output
private. Reproduce with synthetic data before sharing an issue. Never delete
storage/history to force a green result or disable browser signing/policy checks.

Migration undo is available only while no later edits/jobs would be discarded.
It retains originals; it is not a general 2.x-to-1.x downgrade protocol. Restoring
an older profile can discard newer work, so export that work first and restore
only the disposable test copy. A store rollback requires a separately verified,
same-identity forward-version rescue build; browsers may refuse downgrades and
the old runtime must not write concurrently with the new one.
