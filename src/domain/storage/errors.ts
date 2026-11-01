export class MigrationError extends Error {
  constructor(public readonly code: string) {
    // Codes are fixed application strings. Never include private source values.
    super(code);
    this.name = 'MigrationError';
  }
}

export function requireCondition(
  condition: unknown,
  code: string,
): asserts condition {
  if (!condition) throw new MigrationError(code);
}
