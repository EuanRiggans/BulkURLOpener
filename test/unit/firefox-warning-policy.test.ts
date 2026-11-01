import { describe, expect, it } from 'vitest';
import { reviewFirefoxReport } from '../../scripts/firefox-warning-policy';

const vendorSource = '../../node_modules/preact/dist/preact.mjs';
const warning = {
  code: 'UNSAFE_VAR_ASSIGNMENT',
  file: 'chunks/vendor.js',
  line: 1,
  column: 20,
};

describe('Mozilla warning review gate', () => {
  it('passes a clean report', () => {
    expect(
      reviewFirefoxReport(
        { errors: [], warnings: [], notices: [] },
        () => null,
      ),
    ).toBe(0);
  });
  it('accepts only the reviewed source-mapped Preact renderer warning', () => {
    expect(
      reviewFirefoxReport(
        { errors: [], warnings: [warning], notices: [] },
        () => vendorSource,
      ),
    ).toBe(1);
  });
  it('rejects the same warning in application source', () => {
    expect(() =>
      reviewFirefoxReport(
        { errors: [], warnings: [warning], notices: [] },
        () => '../../src/ui/unsafe.tsx',
      ),
    ).toThrow('Unreviewed');
  });
  it('rejects missing source-map evidence', () => {
    expect(() =>
      reviewFirefoxReport(
        { errors: [], warnings: [warning], notices: [] },
        () => null,
      ),
    ).toThrow('Unreviewed');
  });
  it('recognizes Windows path separators in source-map evidence', () => {
    expect(
      reviewFirefoxReport(
        { errors: [], warnings: [warning], notices: [] },
        () => vendorSource.replaceAll('/', String.fromCharCode(92)),
      ),
    ).toBe(1);
  });
  it('rejects other warning codes even in vendor source', () => {
    expect(() =>
      reviewFirefoxReport(
        {
          errors: [],
          warnings: [{ ...warning, code: 'UNKNOWN_WARNING' }],
          notices: [],
        },
        () => vendorSource,
      ),
    ).toThrow('Unreviewed');
  });
  it('rejects additional vendor findings', () => {
    expect(() =>
      reviewFirefoxReport(
        { errors: [], warnings: [warning, warning], notices: [] },
        () => vendorSource,
      ),
    ).toThrow('Additional vendor');
  });
  it('rejects lint errors and unreviewed notices', () => {
    expect(() =>
      reviewFirefoxReport(
        { errors: [{ code: 'ERROR' }], warnings: [], notices: [] },
        () => null,
      ),
    ).toThrow('errors');
    expect(() =>
      reviewFirefoxReport(
        { errors: [], warnings: [], notices: [{}] },
        () => null,
      ),
    ).toThrow('notices');
  });
  it('rejects malformed reports', () => {
    expect(() => reviewFirefoxReport(null, () => null)).toThrow('Unexpected');
    expect(() =>
      reviewFirefoxReport(
        { errors: [], notices: [], warnings: [null] },
        () => null,
      ),
    ).toThrow('format');
  });
});
