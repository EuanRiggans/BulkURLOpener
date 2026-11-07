export const transmittedDataTypes = [
  'browsingActivity',
  'searchTerms',
] as const;
export function hasTransmissionConsent(value: unknown): boolean {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data_collection' in value)
  )
    return false;
  const granted = value.data_collection;
  return (
    Array.isArray(granted) &&
    transmittedDataTypes.every((type) => granted.includes(type))
  );
}
