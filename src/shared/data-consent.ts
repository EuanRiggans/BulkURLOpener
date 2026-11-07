export const transmittedDataTypes = [
  'browsingActivity',
  'searchTerms',
] as const;
export function hasTransmissionConsent(
  value: unknown,
  purpose: 'opening' | 'sync' = 'opening',
): boolean {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data_collection' in value)
  )
    return false;
  const granted = value.data_collection;
  return (
    Array.isArray(granted) &&
    transmittedDataTypes.every((type) => granted.includes(type)) &&
    (purpose !== 'sync' || granted.includes('technicalAndInteraction'))
  );
}
