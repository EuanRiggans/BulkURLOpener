export const privatePrefix = 'buo:private:v1:';
export function scopedKeys(
  changes: Record<string, unknown>,
  area: string,
): string[] {
  if (area === 'local') return Object.keys(changes);
  if (area === 'session')
    return Object.keys(changes)
      .filter((key) => key.startsWith(privatePrefix))
      .map((key) => key.slice(privatePrefix.length));
  return [];
}
