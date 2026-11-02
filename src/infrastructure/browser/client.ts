import * as v from 'valibot';
import { browser } from 'wxt/browser';
import { MigrationError } from '../../domain/storage/errors';

const envelope = v.variant('ok', [
  v.strictObject({ ok: v.literal(true), value: v.unknown() }),
  v.strictObject({ ok: v.literal(false), error: v.string() }),
]);
let origin: Promise<number | null> | undefined;
function originWindow(): Promise<number | null> {
  origin ??= (async () => {
    try {
      return (await browser.windows.getCurrent()).id ?? null;
    } catch {
      return null;
    }
  })();
  return origin;
}
export async function extensionRequest<S extends v.GenericSchema>(
  message: unknown,
  schema: S,
): Promise<v.InferOutput<S>> {
  const response = v.parse(
    envelope,
    await browser.runtime.sendMessage({
      type: 'buo:page',
      windowId: await originWindow(),
      request: message,
    }),
  );
  if (!response.ok) throw new MigrationError(response.error);
  return v.parse(schema, response.value);
}
