import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateBookingCreated,
  validateBookingOverlapRejected,
} from "./booking-concurrency-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("booking concurrency contract", () => {
  it("accepts a persisted staff booking and rejects overlap without a second id", () => {
    expect(validateBookingCreated(201, { booking: { id: "booking-1" } })).toBe("booking-1");
    validateBookingOverlapRejected(409, { error: "Tiden är redan bokad för denna resurs" });
  });

  it("rejects missing ids and illegal overlap success without leaking payloads", () => {
    expect(() => validateBookingCreated(500, { error: "Internt serverfel" })).toThrow(
      /did not persist \(500:none\)/,
    );
    expect(() => validateBookingOverlapRejected(201, { booking: { id: "booking-2" } })).toThrow(
      /was not rejected \(201:created\)/,
    );
    expect(() => validateBookingOverlapRejected(409, { booking: { id: "booking-2" } })).toThrow(
      /was not rejected \(409:created\)/,
    );
  });
});

describe("booking overlap is wired into the required Preview browser job", () => {
  it("requires the staff booking-overlap step", () => {
    expect(REQUIRED_STEPS).toContain("booking-overlap-409");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const booking = readFileSync(new URL("./booking-concurrency.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runStaffBookingOverlap");
    expect(runner).toContain('complete("booking-overlap-409")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(booking).toContain("/api/bookings");
    expect(booking).toContain("validateBookingOverlapRejected");
    expect(booking).not.toContain("page.route");
  });
});
