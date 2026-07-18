export type ConcurrencyCheck =
  | { ok: true; expected: Date; current: Date }
  | { ok: false; code: "missing_version" | "invalid_version" | "stale_version"; expected: Date | null; current: Date };

export function checkOptimisticConcurrency(expectedValue: unknown, current: Date): ConcurrencyCheck {
  if (typeof expectedValue !== "string" || !expectedValue.trim()) {
    return { ok: false, code: "missing_version", expected: null, current };
  }

  const expected = new Date(expectedValue);
  if (Number.isNaN(expected.getTime())) {
    return { ok: false, code: "invalid_version", expected: null, current };
  }

  if (expected.getTime() !== current.getTime()) {
    return { ok: false, code: "stale_version", expected, current };
  }

  return { ok: true, expected, current };
}

export function concurrencyErrorMessage(code: Exclude<ConcurrencyCheck, { ok: true }>["code"]) {
  if (code === "missing_version") return "Arbetsorderns versionsstämpel saknas. Ladda om sidan och försök igen.";
  if (code === "invalid_version") return "Arbetsorderns versionsstämpel är ogiltig. Ladda om sidan och försök igen.";
  return "Arbetsordern har ändrats av någon annan sedan sidan öppnades. Ladda om och kontrollera de nya uppgifterna innan du sparar.";
}
