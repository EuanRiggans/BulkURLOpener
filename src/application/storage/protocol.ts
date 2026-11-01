import * as v from 'valibot';
import {
  decisionsSchema,
  documentSchema,
  hashSchema,
  headSchema,
} from '../../domain/storage/schema';

const type = <A extends string>(action: A) =>
  v.literal(('buo:migration/' + action) as `buo:migration/${A}`);
export const requestSchema = v.variant('type', [
  v.strictObject({ type: type('status') }),
  v.strictObject({ type: type('prepare'), document: documentSchema }),
  v.strictObject({
    type: type('commit'),
    document: documentSchema,
    backupDigest: hashSchema,
    baseHead: v.nullable(headSchema),
    decisions: decisionsSchema,
  }),
  v.strictObject({ type: type('rollback'), expected: headSchema }),
  v.strictObject({ type: type('export'), document: documentSchema }),
  v.strictObject({ type: type('backup'), digest: hashSchema }),
]);
export type MigrationRequest = v.InferOutput<typeof requestSchema>;

export function isMigrationMessage(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type.startsWith('buo:migration/')
  );
}

// The same extension ID alone also matches content scripts; check the page URL.
export function isRecoveryPage(
  sender: { id?: string; url?: string },
  extensionId: string,
  root: string,
): boolean {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const page = new URL(sender.url);
    const extension = new URL(root);
    return (
      ['chrome-extension:', 'moz-extension:'].includes(extension.protocol) &&
      page.protocol === extension.protocol &&
      page.host === extension.host &&
      page.pathname === '/options.html' &&
      !page.username &&
      !page.password
    );
  } catch {
    return false;
  }
}
