import * as v from 'valibot';
import { browser } from 'wxt/browser';
import { MigrationError } from '../../domain/storage/errors';

const envelope = v.variant('ok', [
  v.strictObject({ ok: v.literal(true), value: v.unknown() }),
  v.strictObject({ ok: v.literal(false), error: v.string() }),
]);
export async function extensionRequest<T>(
  message: unknown,
  schema: v.GenericSchema<T>,
): Promise<T> {
  const response = v.parse(
    envelope,
    await browser.runtime.sendMessage(message),
  );
  if (!response.ok) throw new MigrationError(response.error);
  return v.parse(schema, response.value);
}
