import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  listResidentMatchedLeasesMock,
  bookingFindManyMock,
  bookingFindFirstMock,
  bookingCreateMock,
  bookingUpdateMock,
  writeAuditLogMock,
  checkRateLimitMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  listResidentMatchedLeasesMock: vi.fn(),
  bookingFindManyMock: vi.fn(),
  bookingFindFirstMock: vi.fn(),
  bookingCreateMock: vi.fn(),
  bookingUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

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

const requestId = "550e8400-e29b-41d4-a716-446655440000";
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

function request(method = "GET", body?: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/resident-portal/bookings", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("resident-portal bookings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    listResidentMatchedLeasesMock.mockResolvedValue([lease]);
    bookingFindManyMock.mockResolvedValue([]);
    bookingFindFirstMock.mockResolvedValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("lists bookings for matched leases with correlated private success", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.leases).toHaveLength(1);
    expect(bookingFindManyMock).toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident booking list completed",
      expect.objectContaining({
        event: "resident_bookings.list.completed",
        userId: "user-resident",
        companyId: "company-1",
        leaseCount: 1,
        bookingCount: 0,
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("boende@exempel.se");
  });

  it("creates a booking on a matched lease with correlated success", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingCreateMock.mockResolvedValue({
      id: "booking-1",
      resource: "Tvättstuga",
      resident_name: "Boende Test",
      unit: "1201",
      start_at: new Date("2026-08-01T10:00:00.000Z"),
      end_at: new Date("2026-08-01T12:00:00.000Z"),
      note: "Ta med nyckel",
      status: "confirmed",
      created_at: new Date("2026-07-27T10:00:00.000Z"),
      property: lease.property,
    });

    const response = await POST(request("POST", {
      leaseId: "lease-1",
      resource: "Tvättstuga",
      start: "2026-08-01T10:00:00.000Z",
      end: "2026-08-01T12:00:00.000Z",
      note: "Ta med nyckel",
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(bookingCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        property_id: "property-1",
        created_by_id: "user-resident",
        unit: "1201",
      }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident booking created",
      expect.objectContaining({
        event: "resident_bookings.create.completed",
        bookingId: "booking-1",
        leaseId: "lease-1",
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Tvättstuga");
    expect(logged).not.toContain("Ta med nyckel");
    expect(logged).not.toContain("Boende Test");
  });

  it("returns a stable correlated 429 without parsing booking data when rate limited", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const response = await POST(request("POST", { leaseId: "external-lease", resource: "Tvättstuga" }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: "För många bokningar. Vänta en stund och prova igen.",
      errorCode: "RATE_LIMITED",
      requestId,
    });
    expect(listResidentMatchedLeasesMock).not.toHaveBeenCalled();
  });

  it("does not log an unverified submitted lease id when no matched lease exists", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    listResidentMatchedLeasesMock.mockResolvedValue([]);

    const response = await POST(request("POST", {
      leaseId: "external-secret-lease",
      resource: "Tvättstuga",
      start: "2026-08-01T10:00:00.000Z",
      end: "2026-08-01T12:00:00.000Z",
    }));

    expect(response.status).toBe(404);
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-lease");
  });

  it("returns correlated 409 for a verified booking conflict", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingFindFirstMock.mockResolvedValue({ id: "existing-booking" });

    const response = await POST(request("POST", {
      leaseId: "lease-1",
      resource: "Tvättstuga",
      start: "2026-08-01T10:00:00.000Z",
      end: "2026-08-01T12:00:00.000Z",
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorCode).toBe("CONFLICT");
    expect(body.requestId).toBe(requestId);
    expect(bookingCreateMock).not.toHaveBeenCalled();
  });

  it("cancels only the resident's own booking with correlated success", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingFindFirstMock.mockResolvedValue({ id: "booking-1", status: "confirmed" });
    bookingUpdateMock.mockResolvedValue({ id: "booking-1", status: "cancelled" });

    const response = await PATCH(request("PATCH", { bookingId: "booking-1", status: "cancelled" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(bookingFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ created_by_id: "user-resident" }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident booking cancelled",
      expect.objectContaining({ event: "resident_bookings.cancel.completed", bookingId: "booking-1" }),
    );
  });

  it("does not log an unverified booking id on cancel miss", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    bookingFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(request("PATCH", { bookingId: "external-secret-booking", status: "cancelled" }));

    expect(response.status).toBe(404);
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-booking");
    expect(bookingUpdateMock).not.toHaveBeenCalled();
  });

  it("denies staff from resident booking APIs with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({ ...residentUser, role: "manager" });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Endast boende kan använda denna yta",
      errorCode: "FORBIDDEN",
      requestId,
    });
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://secret@db.internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident booking list failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_bookings.list.failed" }),
    );
  });
});
