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
  transactionMock,
  executeRawMock,
  bookingCreateMock,
  propertyFindFirstMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  bookingFindManyMock: vi.fn(),
  bookingFindFirstMock: vi.fn(),
  bookingUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
  executeRawMock: vi.fn(),
  bookingCreateMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
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
    $transaction: transactionMock,
    booking: {
      findMany: bookingFindManyMock,
      findFirst: bookingFindFirstMock,
      updateMany: bookingUpdateManyMock,
      create: bookingCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { GET, PATCH, POST } from "./route";

describe("bookings route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transactionMock.mockImplementation(async (callback) => callback({
      $executeRaw: executeRawMock,
      booking: { findFirst: bookingFindFirstMock, create: bookingCreateMock, updateMany: bookingUpdateManyMock },
      auditLog: { findMany: auditFindManyMock },
    }));
    executeRawMock.mockResolvedValue(1);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Test" });
    bookingCreateMock.mockResolvedValue({ id: "booking-new", created_at: new Date() });
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

  it("redacts resident PII for technicians on GET", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    bookingFindManyMock.mockResolvedValue([{
      id: "booking-1",
      property_id: "property-1",
      property: { name: "Storgatan 1" },
      resource: "Tvättstuga",
      resident_name: "Anna Boende",
      unit: "1201",
      start_at: new Date("2026-07-27T08:00:00Z"),
      end_at: new Date("2026-07-27T10:00:00Z"),
      note: "Privat anteckning",
      status: "confirmed",
      created_at: new Date("2026-07-20T10:00:00Z"),
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookings[0].resident_name).toBeNull();
    expect(body.bookings[0].unit).toBe("");
    expect(body.bookings[0].note).toBe("");
    expect(body.permissions.canManage).toBe(false);
    expect(body.permissions.canViewResidentDetails).toBe(false);
  });

  it("denies technicians from mutating bookings", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "booking-1", status: "cancelled" }),
    }));
    expect(response.status).toBe(403);
    expect(bookingFindFirstMock).not.toHaveBeenCalled();
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
    }), expect.objectContaining({ booking: expect.anything() }));
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
  const createBody = { propertyId: "property-1", resource: "Tvättstuga", residentName: "Test", start: "2026-09-08T08:00:00Z", end: "2026-09-08T09:00:00Z" };
  const createRequest = (body = createBody) => new Request("http://localhost/api/bookings", { method: "POST", body: JSON.stringify(body) });
  it("locks before testing availability and persists creation with its audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const response = await POST(createRequest());
    expect(response.status).toBe(201);
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeLessThan(bookingFindFirstMock.mock.invocationCallOrder[0]);
    expect(executeRawMock.mock.calls[0][1]).toBe("resident-booking:company-1:property-1:tvättstuga");
    expect(bookingFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-1", resource: { equals: "Tvättstuga", mode: "insensitive" } }) }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "booking.created" }), expect.objectContaining({ booking: expect.anything() }));
  });
  it("does not create when another writer won the slot", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    bookingFindFirstMock.mockResolvedValue({ id: "competing-booking" });
    expect((await POST(createRequest())).status).toBe(409);
    expect(bookingCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
  it("fails creation if its audit fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));
    expect((await POST(createRequest())).status).toBe(500);
  });
  it("does not enter the transaction for a foreign property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);
    expect((await POST(createRequest())).status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });
  it.each(["resident", "viewer", "technician", "vendor", "unknown"])("denies %s creation", async (role) => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role });
    expect((await POST(createRequest())).status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });
  it.each([{ status: "cancelled" }, { resource: "Bastu" }])("rejects a stale edit/cancellation %j", async (change) => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    bookingFindFirstMock.mockResolvedValueOnce({ id: "booking-1", property_id: "property-1", status: "confirmed", resource: "Tvättstuga", resident_name: "Test", start_at: new Date(createBody.start), end_at: new Date(createBody.end), updated_at: new Date("2026-09-07") }).mockResolvedValueOnce(null);
    bookingUpdateManyMock.mockResolvedValue({ count: 0 });
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ bookingId: "booking-1", ...change }) }));
    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(bookingUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-1", status: "confirmed", updated_at: new Date("2026-09-07") }) }));
  });

});
