import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateForeignLeaseHidden,
  validateMatchedLeaseVisible,
  validateResidentBookingCreated,
  validateResidentBookingOverlapRejected,
  validateResidentCreated,
  validateResidentForbidden,
  validateResidentLeaseCreated,
  validateResidentPasswordChangeRejected,
  validateResidentProfile,
  validateResidentTicketCreated,
  validateResidentTicketVisible,
  validateResidentUnitCreated,
} from "./resident-portal-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("resident-portal contract", () => {
  it("accepts an owner-created resident, matched lease and portal ticket", () => {
    expect(validateResidentCreated(201, { member: { id: "res-1", role: "resident" } })).toBe("res-1");
    expect(validateResidentUnitCreated(201, { unit: { id: "unit-1" } })).toBe("unit-1");
    expect(validateResidentLeaseCreated(201, {
      lease: { id: "lease-1", status: "active", property_id: "prop-1" },
    }, "prop-1")).toBe("lease-1");
    validateResidentProfile(200, {
      user: { role: "resident", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1");
    validateResidentForbidden(403, { errorCode: "FORBIDDEN" }, "Staff leases");
    validateResidentForbidden(403, { errorCode: "RESIDENT_PORTAL_ONLY" }, "Onboarding");
    validateResidentPasswordChangeRejected(400, { error: "Nuvarande lösenord är felaktigt" });
    validateMatchedLeaseVisible(200, {
      isResident: true,
      canCreate: true,
      leases: [{ id: "lease-1" }],
    }, "lease-1");
    expect(validateResidentTicketCreated(201, { ticket: { id: "ticket-1" } })).toBe("ticket-1");
    validateResidentTicketVisible(200, { ticket: { id: "ticket-1" } }, "ticket-1");
    validateForeignLeaseHidden(404, {});
    expect(validateResidentBookingCreated(201, { booking: { id: "booking-1" } })).toBe("booking-1");
    validateResidentBookingOverlapRejected(409, { errorCode: "CONFLICT" });
  });

  it("rejects owner-shaped profiles and leaked staff surfaces without payloads", () => {
    expect(() => validateResidentCreated(403, { errorCode: "FORBIDDEN" })).toThrow(
      /was not created \(403:FORBIDDEN\)/,
    );
    expect(() => validateResidentProfile(200, {
      user: { role: "owner", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1")).toThrow(/scoped self-service fixture/);
    expect(() => validateResidentForbidden(200, { leases: [] }, "Staff leases")).toThrow(
      /Staff leases was not forbidden \(200:none\)/,
    );
    expect(() => validateResidentPasswordChangeRejected(403, { errorCode: "RESIDENT_PORTAL_ONLY" })).toThrow(
      /allowlisted settings route \(403:RESIDENT_PORTAL_ONLY\)/,
    );
    expect(() => validateMatchedLeaseVisible(200, {
      isResident: true,
      canCreate: true,
      leases: [],
    }, "lease-1")).toThrow(/matched lease \(200:none\)/);
    expect(() => validateForeignLeaseHidden(201, { ticket: { id: "ticket-1" } })).toThrow(
      /visible to the resident \(201:none\)/,
    );
    expect(() => validateResidentBookingOverlapRejected(201, { booking: { id: "booking-2" } })).toThrow(
      /was not rejected \(201:none\)/,
    );
  });
});

describe("resident portal is wired into the required Preview browser job", () => {
  it("requires the resident-portal Preview step", () => {
    expect(REQUIRED_STEPS).toContain("resident-portal-preview");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const source = readFileSync(new URL("./resident-portal.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runResidentPortalPreview");
    expect(runner).toContain('complete("resident-portal-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain("/api/team");
    expect(source).toContain("/api/resident-portal");
    expect(source).toContain("/api/leases");
    expect(source).toContain("/api/settings/company");
    expect(source).toContain("/api/billing");
    expect(source).toContain("/api/integrations");
    expect(source).toContain("/api/onboarding");
    expect(source).toContain("/api/settings/password");
    expect(source).toContain("validateResidentPasswordChangeRejected");
    expect(source).not.toContain("page.route");
  });
});
