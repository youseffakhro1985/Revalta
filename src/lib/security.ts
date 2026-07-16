const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const passwordPolicyMessage = "Lösenordet ska ha minst 10 tecken samt innehålla både bokstav och siffra";

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: string) {
  return value.length <= 254 && emailPattern.test(value);
}

export function isStrongPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 10 &&
    value.length <= 128 &&
    /[A-Za-zÅÄÖåäö]/.test(value) &&
    /\d/.test(value)
  );
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
