export const listingNumberValue = (event: Event): number | null => {
  const input = event.target as HTMLInputElement;
  if (input.validity.badInput) return Number.NaN;
  return input.value === "" ? null : Number(input.value);
};
