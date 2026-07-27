import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  listResidentMatchedLeasesMock,
  bookingFindManyMock,
  bookingFindFirstMock,
  bookingCreateMock,
  bookingUpdateMock,
  writeAuditLogMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listResidentMatchedLeasesMock: vi.fn(),
  bookingFindManyMock: vi.fn(),
  bookingFindFirstMock: vi.fn(),
  bookingCreateMock: vi.fn(),
  bookingUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-leases", () => ({
  listResidentMatchedLeases: listResidentMatchedLeasesMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/db", () => ({
  default: {
    booking: {
      findMany: bookingFindManyMock,
      findFirst: bookingFindFirstMock,
      create: bookingCreateMock,
      update: bookingUpdateMock,
    },
  },
}));

import { GET, PATCH, POST } from "./route";

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};

const lease = {
  id: "lease-1",
  lease_number: "L-1",
  property_id: "property-1",
  unit_id: "unit-1",
  property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
  unit: { id: "unit-1", designation: "1201" },
  lease_holder: { name: "Boende Test", contact_name: null },
};

describe("resident-portal bookings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    listResidentMatchedLeasesMock.mockResolvedValue([lease]);
    bookingFindManyMock.mockResolvedValue([]);
    bookingFindFirstMock.mockResolvedValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("lists bookings for matched leases", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leases).toHaveLength(1);
    expect(bookingFindManyMock).toHaveBeenCalled();
  });

  it("creates a booking on a matched lease", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingCreateMock.mockResolvedValue({
      id: "booking-1",
      resource: "Tvättstuga",
      resident_name: "Boende Test",
      unit: "1201",
      start_at: new Date("2026-08-01T10:00:00.000Z"),
      end_at: new Date("2026-08-01T12:00:00.000Z"),
      note: null,
      status: "confirmed",
      created_at: new Date("2026-07-27T10:00:00.000Z"),
      property: lease.property,
    });

    const response = await POST(
      new Request("https://www.revalta.se/api/resident-portal/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: "lease-1",
          resource: "Tvättstuga",
          start: "2026-08-01T10:00:00.000Z",
          end: "2026-08-01T12:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        property_id: "property-1",
        created_by_id: "user-resident",
        unit: "1201",
      }),
    }));
  });

  it("cancels only the resident's own booking", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingFindFirstMock.mockResolvedValue({ id: "booking-1", status: "confirmed" });
    bookingUpdateMock.mockResolvedValue({ id: "booking-1", status: "cancelled" });

    const response = await PATCH(
      new Request("https://www.revalta.se/api/resident-portal/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: "booking-1", status: "cancelled" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(bookingFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        created_by_id: "user-resident",
      }),
    }));
  });

  it("denies staff from resident booking APIs", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...residentUser,
      role: "manager",
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });
});
