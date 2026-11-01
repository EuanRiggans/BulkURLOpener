import * as v from 'valibot';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(
      Object.getPrototypeOf(value) as object | null,
    )
  );
}

function isJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 200 || ancestors.has(value))
    return false;
  if (!Array.isArray(value) && !plainObject(value)) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  if (
    Array.isArray(value) &&
    (Object.keys(value).length !== value.length ||
      !Object.keys(value).every((key, index) => key === String(index)))
  )
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    isJson(item, ancestors, depth + 1),
  );
  ancestors.delete(value);
  return valid;
}

// Valibot record() intentionally drops __proto__/constructor/prototype keys.
// Raw recovery records must instead validate without changing any key/value.
export const jsonValueSchema = v.custom<JsonValue>((value) => isJson(value));
export const jsonObjectSchema = v.custom<Record<string, JsonValue>>(
  (value) => plainObject(value) && isJson(value),
);
export const stringRecordSchema = v.custom<Record<string, string>>(
  (value) =>
    plainObject(value) &&
    isJson(value) &&
    Object.values(value).every((item) => typeof item === 'string'),
);

// Sorting object keys makes comparisons independent of storage enumeration order.
// Array order, duplicates, whitespace and raw malformed strings remain exact.
export function stableJson(value: unknown): string {
  const parsed = v.parse(jsonValueSchema, value);
  function ordered(item: JsonValue): JsonValue {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, ordered(item[key]!)]),
      );
    return item;
  }
  return JSON.stringify(ordered(parsed));
}

export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
