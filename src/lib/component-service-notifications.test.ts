import { describe, expect, it } from "vitest";
import {
  componentServiceNotificationRoles,
  defaultComponentServiceNotificationPreferences,
  parseComponentServiceNotificationPreferences,
  validateComponentServiceNotificationPreferences,
} from "./component-service-notifications";

describe("component service notification preferences", () => {
  it("uses isolated defaults for invalid stored payloads", () => {
    const first = parseComponentServiceNotificationPreferences(null);
    first.roles.pop();
    const second = parseComponentServiceNotificationPreferences(undefined);

    expect(second).toEqual(defaultComponentServiceNotificationPreferences);
    expect(second.roles).toEqual(componentServiceNotificationRoles);
  });

  it("normalizes, de-duplicates and limits stored email recipients", () => {
    const emails = Array.from({ length: 25 }, (_, index) => ` User${index}@Example.com `);
    emails.push("user0@example.com", "invalid");

    const result = parseComponentServiceNotificationPreferences({
      enabled: false,
      daysAhead: 14,
      roles: ["admin", "admin", "unknown"],
      additionalEmails: emails,
    });

    expect(result.enabled).toBe(false);
    expect(result.daysAhead).toBe(14);
    expect(result.roles).toEqual(["admin"]);
    expect(result.additionalEmails).toHaveLength(20);
    expect(result.additionalEmails[0]).toBe("user0@example.com");
  });

  it("rejects malformed payloads", () => {
    expect(validateComponentServiceNotificationPreferences(null)).toEqual({
      success: false,
      error: "Ogiltigt JSON-underlag",
    });
    expect(validateComponentServiceNotificationPreferences([])).toEqual({
      success: false,
      error: "Ogiltigt JSON-underlag",
    });
  });

  it.each([0, 91, 2.5, "not-a-number"])("rejects invalid daysAhead %s", (daysAhead) => {
    const result = validateComponentServiceNotificationPreferences({
      enabled: true,
      daysAhead,
      roles: ["owner"],
      additionalEmails: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Aviseringsperioden måste vara mellan 1 och 90 dagar",
    });
  });

  it("rejects missing or invalid recipient roles", () => {
    const result = validateComponentServiceNotificationPreferences({
      enabled: true,
      daysAhead: 30,
      roles: ["tenant"],
      additionalEmails: [],
    });

    expect(result).toEqual({
      success: false,
      error: "Minst en giltig mottagarroll måste väljas",
    });
  });

  it("rejects malformed additional email values", () => {
    expect(validateComponentServiceNotificationPreferences({
      enabled: true,
      daysAhead: 30,
      roles: ["owner"],
      additionalEmails: "owner@example.com",
    })).toEqual({ success: false, error: "Extra mottagare måste anges som en lista" });

    expect(validateComponentServiceNotificationPreferences({
      enabled: true,
      daysAhead: 30,
      roles: ["owner"],
      additionalEmails: ["not-an-email"],
    })).toEqual({ success: false, error: "Ange högst 20 giltiga e-postadresser" });
  });

  it("returns normalized preferences for a valid payload", () => {
    const result = validateComponentServiceNotificationPreferences({
      enabled: true,
      daysAhead: 45,
      roles: ["property_manager", "admin", "admin"],
      additionalEmails: [" Drift@Example.se ", "drift@example.se"],
    });

    expect(result).toEqual({
      success: true,
      preferences: {
        enabled: true,
        daysAhead: 45,
        roles: ["property_manager", "admin"],
        additionalEmails: ["drift@example.se"],
      },
    });
  });
});
