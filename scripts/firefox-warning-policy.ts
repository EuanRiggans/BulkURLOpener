type LintMessage = Record<string, unknown>;

export function reviewFirefoxReport(
  report: unknown,
  originalSource: (warning: LintMessage) => string | null,
): number {
  if (
    typeof report !== 'object' ||
    report === null ||
    !('errors' in report) ||
    !Array.isArray(report.errors) ||
    !('warnings' in report) ||
    !Array.isArray(report.warnings) ||
    !('notices' in report) ||
    !Array.isArray(report.notices)
  )
    throw new Error('Unexpected Mozilla lint report.');
  if (report.errors.length) throw new Error('Mozilla lint reported errors.');
  if (report.notices.length)
    throw new Error('Mozilla lint reported unreviewed notices.');

  let reviewedVendorWarnings = 0;
  for (const candidate of report.warnings as unknown[]) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('code' in candidate)
    ) {
      throw new Error('Unexpected Mozilla warning format.');
    }
    const warning = candidate as LintMessage;
    const source = originalSource(warning)?.replaceAll('\\', '/');
    // Preact's renderer supports HTML injection, but the application forbids
    // that feature. Accept only this reviewed vendor location, never app code.
    if (
      warning.code !== 'UNSAFE_VAR_ASSIGNMENT' ||
      !source?.endsWith('/node_modules/preact/dist/preact.mjs')
    )
      throw new Error(
        `Unreviewed Mozilla warning: ${String(warning.code)} in ${String(warning.file)}`,
      );
    reviewedVendorWarnings++;
  }
  if (reviewedVendorWarnings > 1)
    throw new Error('Additional vendor warnings require review.');
  return reviewedVendorWarnings;
}
