import { describe, expect, it } from "vitest";
import { mapResidentPortalBooking, mapResidentPortalLease } from "@/lib/resident-portal-bookings";

const property = { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" };

describe("resident portal booking mapping", () => {
  it("maps matched leases and marks createdByMe only from the authenticated creator", () => {
    expect(mapResidentPortalLease({
      id: "lease-1",
      lease_number: "L-1",
      property_id: "property-1",
      unit_id: "unit-1",
      property,
      unit: { id: "unit-1", designation: "1201" },
      lease_holder: { id: "holder-1", name: "Boende Test", contact_name: "Ada Boende", email: "boende@exempel.se", phone: null },
    })).toEqual({
      id: "lease-1",
      leaseNumber: "L-1",
      property,
      unit: { id: "unit-1", designation: "1201" },
      holderName: "Ada Boende",
    });

    const own = mapResidentPortalBooking({
      id: "booking-1",
      resource: "Tvättstuga",
      resident_name: "Boende Test",
      unit: "1201",
      start_at: new Date("2026-08-01T10:00:00.000Z"),
      end_at: new Date("2026-08-01T12:00:00.000Z"),
      note: "Ta med nyckel",
      status: "confirmed",
      created_by_id: "user-resident",
      created_at: new Date("2026-07-27T10:00:00.000Z"),
      property,
    }, "user-resident");

    expect(own.createdByMe).toBe(true);
    expect(own.start).toBe("2026-08-01T10:00:00.000Z");
    expect(mapResidentPortalBooking({
      id: "booking-2",
      resource: "Tvättstuga",
      resident_name: "Boende Test",
      unit: "1201",
      start_at: new Date("2026-08-01T10:00:00.000Z"),
      end_at: new Date("2026-08-01T12:00:00.000Z"),
      note: null,
      status: "confirmed",
      created_by_id: "someone-else",
      created_at: new Date("2026-07-27T10:00:00.000Z"),
      property,
    }, "user-resident").createdByMe).toBe(false);
  });
});
