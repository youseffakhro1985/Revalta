import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  bookingFindManyMock,
  bookingFindFirstMock,
  bookingUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  bookingFindManyMock: vi.fn(),
  bookingFindFirstMock: vi.fn(),
  bookingUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    booking: {
      findMany: bookingFindManyMock,
      findFirst: bookingFindFirstMock,
      updateMany: bookingUpdateManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET, PATCH } from "./route";

describe("bookings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookingFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    bookingUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("lists modern bookings only for active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(bookingFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", property: { deleted_at: null } },
    }));
  });

  it("updates modern booking fields on active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    bookingFindFirstMock
      .mockResolvedValueOnce({
        id: "booking-1",
        property_id: "property-1",
        status: "confirmed",
        resource: "Tvättstuga",
        resident_name: "Anna",
        unit: "1201",
        start_at: new Date("2026-07-27T08:00:00Z"),
        end_at: new Date("2026-07-27T10:00:00Z"),
        note: null,
      })
      .mockResolvedValueOnce(null);

    const response = await PATCH(new Request("http://localhost/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: "booking-1",
        residentName: "Anna Andersson",
        resource: "Tvättstuga",
        unit: "1201",
        start: "2026-07-27T08:00:00.000Z",
        end: "2026-07-27T11:00:00.000Z",
        note: "Uppdaterad",
      }),
    }));

    expect(response.status).toBe(200);
    expect(bookingFindFirstMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "booking-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(bookingUpdateManyMock).toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "booking.updated",
    }));
  });

  it("returns 404 when booking belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    bookingFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "booking-1" });

    const response = await PATCH(new Request("http://localhost/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "booking-1", status: "cancelled" }),
    }));

    expect(response.status).toBe(404);
    expect(bookingUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy booking updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    bookingFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(new Request("http://localhost/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "legacy-1", status: "cancelled" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
  });
});
