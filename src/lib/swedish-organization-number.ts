export function normalizeSwedishOrganizationNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 || Number(digits[2]) < 2) return null;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    const product = Number(digits[index]) * (index % 2 === 0 ? 2 : 1);
    sum += Math.floor(product / 10) + (product % 10);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  if (checkDigit !== Number(digits[9])) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function isValidSwedishOrganizationNumber(value: unknown) {
  return normalizeSwedishOrganizationNumber(value) !== null;
}
