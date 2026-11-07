# Build and inspect the browser preview

Use Node.js 24 and npm; Git is also needed for the checkout-selection packaging
test in full validation. No Electron, desktop builder, signing key or browser
account is needed to build. The package version comes from `package.json`;
`2.0.0` remains an unreleased development preview.

```sh
npm ci
npm run validate
npm run package
npm run check:packages
npm run check:reproducibility
```

`npm run test:upgrade` runs the separate synthetic same-ID development update
suite with the disposable browser environment used by browser CI. It does not
establish a signed-store upgrade. `npm run upgrade:compare -- BEFORE.json AFTER.json`
compares private baseline/recovery captures without writing them; see
[the upgrade protocol](UPGRADE_VERIFICATION.md) and [release gates](PHASE_7_RELEASE.md).

`validate` checks the source tree, types, lint, formatting, maintained tests,
both MV3 builds, generated resources, bundled licences and Mozilla validation.
The narrow, pinned Preact vendor warning policy remains visible. Actual browser
tests run independently through the configured Selenium CI profiles.

## Outputs

`dist/` contains exactly four files for the current version:

- `bulk-url-opener-2.0.0-chrome.zip`
- `bulk-url-opener-2.0.0-firefox.zip`
- `bulk-url-opener-2.0.0-source.zip`
- `SHA256SUMS`

Browser ZIPs place their manifest at the archive root. They contain the nine
bundled pages, background, local chunks/CSS, maps, icons and `LICENSES.txt`.
The Firefox ID is retained; the packages are unsigned and no store upload runs.
Source maps expose maintained source, so source/build privacy review still
applies. They do not contain a browser profile or installed-user data.

The source ZIP contains maintained source, public assets, build/configuration
files, tests, historical fixtures, docs, licences and the lockfile. From a Git
checkout it includes **tracked files only**, read from the working tree. Stage
or commit intended new files before packaging. It rejects environment files,
private/generated paths, retired code and symlinks, including symlinked parents.

The exported `.source-manifest.json` records the exact source file list. It lets
the archive rebuild without repository metadata and excludes new unlisted files. When adding
source files to an exported tree, update that list, or create a Git checkout
with the intended files tracked and remove the generated manifest.

ZIP entries are sorted and use fixed timestamps/permissions. Checksums detect
changed bytes; they are not signatures or proof of store approval. Package
verification compares every member and its full contents with the current build
and source. Keep older packages outside `dist/` when changing versions; unexpected
files cause verification to fail rather than being deleted automatically.

## Reproduction

`check:reproducibility` extracts the verified source ZIP into a new temporary
directory, installs from the lockfile, runs validation, rebuilds/packages and
compares both complete browser outputs, three ZIPs and checksum file byte for
byte. Synthetic `.env`, private-export and profile decoys must stay out of the
rebuilt source package. Its temporary directory is removed after the check.

The CI job runs this after its main validation and uploads only verified
`dist/` files as `extension-preview-packages`, with 14-day artifact retention.
Reproduction is tested on Linux with Node 24; this does not establish identical
output on every Node release, OS or future dependency graph. The archives are
recreatable from the pushed checkpoint after the artifact download expires.

## Dependency and licence maintenance

Production source maps identify bundled packages. `verify-builds.mjs` requires
a notice for each, including WXT helpers declared through build dependencies.
For a reviewed dependency update, run `npm run licenses:update`; inspect the
notice changes before committing. WXT publishes MIT metadata without its licence
file, so `licenses/wxt-MIT.txt` retains the reviewed upstream notice. The other
notices are read from installed pinned packages. Original icon bytes and the
project's MIT notice are retained.

Do not apply a forced audit fix that downgrades modern lint/Mozilla tooling.
Review advisory paths and compatible upstream fixes, then run validation,
package/reproduction checks and the real-browser matrix. The full toolchain
and declared-runtime audits are separate from extension behavior and signed
upgrade verification. See [Phase 6](PHASE_6_CLEANUP.md) for the recorded review.
