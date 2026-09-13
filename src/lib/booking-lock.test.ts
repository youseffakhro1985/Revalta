import { expect, it, vi } from "vitest";
import { lockBookingResources } from "./booking-lock";
it("shares the resident lock namespace, normalizes duplicates and locks moves in stable order", async () => {
  const execute = vi.fn().mockResolvedValue(1);
  await lockBookingResources({ $executeRaw: execute }, "company-a", "property-a", ["Tvättstuga", "Bastu", " TVÄTTSTUGA "]);
  expect(execute.mock.calls.map((call) => call[1])).toEqual([
    "resident-booking:company-a:property-a:bastu", "resident-booking:company-a:property-a:tvättstuga",
  ]);
});
it("does not share another company's lock key", async () => {
  const execute = vi.fn().mockResolvedValue(1);
  await lockBookingResources({ $executeRaw: execute }, "company-a", "property", ["Bastu"]);
  await lockBookingResources({ $executeRaw: execute }, "company-b", "property", ["Bastu"]);
  expect(execute.mock.calls[0][1]).not.toBe(execute.mock.calls[1][1]);
});
