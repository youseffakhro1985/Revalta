const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const passwordPolicyMessage =
  "Lösenordet ska ha minst 10 tecken, innehålla både bokstav och siffra och får inte vara för långt";

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: string) {
  return value.length <= 254 && emailPattern.test(value);
}

export function isStrongPassword(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const utf8Length = new TextEncoder().encode(value).length;
  return (
    value.length >= 10 &&
    value.length <= 128 &&
    utf8Length <= BCRYPT_MAX_PASSWORD_BYTES &&
    /[A-Za-zÅÄÖåäö]/.test(value) &&
    /\d/.test(value)
  );
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
