import { describe, expect, it } from "vitest";
import {
  defaultCompanyServicePreferences,
  defaultUserServicePreferences,
  normalizeEmail,
  parseCompanyServicePreferences,
  parseUserServicePreferences,
} from "@/lib/service-notification-settings";

describe("service-notification-settings", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail(null)).toBe("");
  });

  it("parses company preferences with defaults and validation", () => {
    expect(parseCompanyServicePreferences(null)).toEqual(defaultCompanyServicePreferences);
    expect(parseCompanyServicePreferences({
      enabled: false,
      daysAhead: 14,
      roles: ["owner", "viewer", "admin", "owner"],
      additionalEmails: ["ok@example.com", "bad", "OK@example.com"],
    })).toEqual({
      enabled: false,
      daysAhead: 14,
      roles: ["owner", "admin"],
      additionalEmails: ["ok@example.com"],
    });
    expect(parseCompanyServicePreferences({ daysAhead: 999, roles: [] }).daysAhead).toBe(30);
  });

  it("parses user preferences", () => {
    expect(parseUserServicePreferences(undefined)).toEqual(defaultUserServicePreferences);
    expect(parseUserServicePreferences({ enabled: false, overdueOnly: true })).toEqual({
      enabled: false,
      overdueOnly: true,
    });
  });
});
