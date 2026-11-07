# Phase 7: Upgrade verification and release preparation

Started 6 November; prepared 7 November 2026 on `redevelopment`, from
[`d2622b5bddcb69439525f8784b805ec6522a4aeb`](https://github.com/EuanRiggans/BulkURLOpener/tree/d2622b5bddcb69439525f8784b805ec6522a4aeb).
**Status: release preparation; release approval remains blocked by the gates
below.** `2.0.0` is still an unsigned preview. No store submission/signing,
website publication, default-branch merge or release rollout occurs in this phase.

## Changes

- Added a read-only [upgrade comparison](UPGRADE_VERIFICATION.md) command and
  actual same-identity **development** update tests in the browser matrix.
  Canonical comparisons validate full ancestry, retained originals and exact
  data, not just counts. Legacy comparisons reuse the migration choices stored
  in the verified candidate. The command emits fixed codes/counts, not private
  contents. Its input files are never added to a source package.
- Added Firefox's optional settings-data declaration for manual sync. The upload
  click requests optional consent; the background separately checks it before
  any sync write. Decline/error leaves the reviewed upload and both stores intact.
  A second check after serialized backup work handles a grant revoked while the
  request was waiting; any verified backup already created remains retained.
  Ordinary navigation still uses the original required categories. Tests cover
  refusal/retry and the native API with an explicit disposable-harness grant;
  the actual native consent prompt remains a manual signed-build gate.
- Kept the simple 540px-preferred-width popup and separate editors. Data &
  recovery now explains that mandatory history/import retention can fill storage.
  Added a bounded real-Chrome history-growth run after the 5,000-entry case,
  checking preservation/read-only export if saves hit the actual local quota.
  Firefox has no equivalent fixed local-quota constant, so Chrome-specific quota
  cases are explicitly skipped there.
- Prepared [store identities, descriptions and disclosure drafts](STORE_SUBMISSION.md),
  signed-upgrade steps, rollback limits and the controlled release checklist.
  Existing store identities remain; dashboard access/ownership is not inferred
  from public listings.

## Storage capacity decision

**Confirmed by source:** each library/settings mutation retains an immutable
full canonical state; reviewed transfer bodies, raw migration sources, conflict
copies and job records also remain. Only optional verified snapshots have bounded
retention. Disabling snapshots does not bound mandatory history. The real-browser
capacity run reports measured bytes/saves in the Chrome evidence artifact; it is
a bounded synthetic workload, not unlimited-capacity evidence.

The safe decision for this candidate is to preserve existing records and fail
visibly on quota errors. No automatic history purge, data reset, permission
expansion to `unlimitedStorage` or format rewrite is hidden in release preparation.
This prevents deleting recovery data to make a test pass, but it does **not** solve
long-term growth. A production release needs a reviewed retention/storage design
and repeated-save evidence. A future design can deduplicate unchanged data or
support explicit archive/compaction with verified independent backups; it must
retain existing raw sources and have its own migration/interruption tests.
Until then this is a release blocker for large/long-lived installations, not an
optional cosmetic improvement. The existing source-only cleanup never touched
installed user storage.

## Dependency review

Fresh `npm ci` uses the pinned lockfile on Node `24.19.0` / npm `11.9.0`.
The 7 November advisory response has zero declared-runtime advisories and 14
toolchain entries: ten moderate, four low, zero high/critical. The affected paths
remain lint glob processing (`GHSA-g3hv-75wg-m249`, nested minimatch `10.2.6`)
and Mozilla tooling (`GHSA-gcqx-w48m-w2h4`, deepmerge `4.3.1`). Advisory counts can
change without a lockfile change. Review them again at submission.

No supported compatible fix is applied here. npm currently proposes ESLint 9 or
web-ext 3 downgrades; no forced downgrade or unsupported minimatch major override
is used. Available Preact `11.2.0` and Vite `8.3.6` updates do not resolve these
paths and are deferred while this candidate is being verified. TypeScript 7 and
Node 26 declarations remain outside this toolchain's supported peer/runtime
baseline. The existing high/critical CI gate and exact bundled licence/vendor
warning verification remain enabled.

## Evidence and limits

Local validation covers 284 maintained unit checks and seven packaging checks,
strict types/lint/format, both MV3 builds/resources/licences, Mozilla validation,
the actual comparison CLI and clean source/archive reproduction. Mozilla reports
zero errors/unreviewed warnings and the existing one reviewed Preact renderer
warning. Linux browser CI runs Chrome stable, Firefox stable and Firefox ESR;
its upgrade result has its own `upgrade-summary.json` beside existing evidence.
Consult the workflows on the pushed checkpoint for exact versions/results.

The managed workspace's browser policy is respected; local build/unit success is
not claimed as local extension runtime testing. Hosted tests use synthetic fresh
profiles without browser-account sign-in. They do not establish genuine signed
candidate upgrades, account-provider delivery, native screen-reader listening,
native action-popup size/close behavior or Windows/macOS/other-browser coverage.

## Release checklist

All unchecked items are required evidence or decisions, not claimed passes.

- [ ] Maintainer verifies existing Firefox/Chrome/Edge/Opera dashboard identities
      and chooses a supported same-ID test/signing route and version before signing.
- [ ] A signed candidate updates genuine published installations under each
      intended store identity without uninstalling; private before/after comparison
      and restart evidence passes, including damaged/large copies and all references.
- [ ] Native install/update/data-consent prompts and refusal are verified on the
      signed Firefox candidate; API/menu permission changes are recorded per store.
- [ ] The long-term history/capacity design is resolved and verified without
      deleting retained originals or hiding quota failure.
- [ ] Real same-account, two-installation sync delivery/conflict/offline checks
      pass independently for Firefox and a Chromium provider.
- [ ] Native popup/menu/shortcut/clipboard/download behavior, accessibility and
      the supported OS/browser matrix pass [the manual checks](PHASE_5_MANUAL_CHECKS.md).
- [ ] Final advisory/licence review, privacy policy URL, listing/dashboard
      disclosures, screenshots, supported-version claims and reviewer source match.
- [ ] Maintainer approves the exact candidate commit, browser/source hashes,
      signed versions and a monitoring/stop/forward-rescue procedure.

Only then prepare a separate authorized store submission. Start with the smallest
available test/staged cohort supported by that store, monitor migration/recovery
failures without collecting user contents, and stop distribution on preservation
or unexpected-navigation failures. Keep known packages, source and private backups
for forward rescue. Do not promise the store supports a percentage rollout or
private same-ID channel without confirming its actual capabilities.

The absence of store credentials/accounts in this environment prevents signing
and provider-delivery evidence here. Do not paste tokens or profiles into chat,
issues or Git. [The upgrade protocol](UPGRADE_VERIFICATION.md) and store draft make
the remaining maintainer work concrete; they do not substitute for its results.
