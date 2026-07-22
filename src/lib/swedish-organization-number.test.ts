import { describe, expect, it } from "vitest";
import { isValidSwedishOrganizationNumber, normalizeSwedishOrganizationNumber } from "@/lib/swedish-organization-number";

describe("Swedish organization numbers", () => {
  it.each([
    ["556016-0680", "556016-0680"],
    ["5560160680", "556016-0680"],
    [" 556 016-0680 ", "556016-0680"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSwedishOrganizationNumber(input)).toBe(expected);
    expect(isValidSwedishOrganizationNumber(input)).toBe(true);
  });

  it.each(["", "123", "556016-0681", "121212-1212", "SE556016068001"])("rejects invalid value %s", (input) => {
    expect(normalizeSwedishOrganizationNumber(input)).toBeNull();
    expect(isValidSwedishOrganizationNumber(input)).toBe(false);
  });
});
