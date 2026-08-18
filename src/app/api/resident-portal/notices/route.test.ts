import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  listResidentMatchedLeasesMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  rentNoticeFindManyMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  listResidentMatchedLeasesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  rentNoticeFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-leases", () => ({
  listResidentMatchedLeases: listResidentMatchedLeasesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    rentNotice: { findMany: rentNoticeFindManyMock },
  },
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request() {
  return new Request("https://www.revalta.se/api/resident-portal/notices", {
    headers: { "x-request-id": requestId },
  });
}

describe("resident-portal notices route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    listResidentMatchedLeasesMock.mockResolvedValue([
      {
        id: "lease-1",
        lease_number: "L-1",
        property_id: "property-1",
        unit_id: "unit-1",
        property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
        unit: { id: "unit-1", designation: "1201" },
        lease_holder: { name: "Boende", contact_name: null },
      },
    ]);
    rentNoticeFindManyMock.mockResolvedValue([
      {
        id: "notice-1",
        lease_id: "lease-1",
        tenant_name: "Boende",
        unit: "1201",
        period: "2026-08",
        due_date: new Date("2026-08-01T00:00:00.000Z"),
        status: "sent",
        base_rent: 10000,
        index_percent: 0,
        indexed_rent: 10000,
        additions: 0,
        deductions: 0,
        total: 10000,
        note: "Personlig notering",
        created_at: new Date("2026-07-20T00:00:00.000Z"),
        property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
      },
    ]);
  });

  it("returns notices for email-matched leases with correlated private success", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(body.notices).toHaveLength(1);
    expect(body.notices[0].total).toBe(10000);
    expect(rentNoticeFindManyMock).toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident notice list completed",
      expect.objectContaining({
        event: "resident_notices.list.completed",
        userId: "user-1",
        companyId: "company-1",
        leaseCount: 1,
        noticeCount: 1,
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("boende@exempel.se");
    expect(logged).not.toContain("Boende");
    expect(logged).not.toContain("1201");
    expect(logged).not.toContain("10000");
    expect(logged).not.toContain("Personlig notering");
  });

  it("returns empty notices when no leases match without querying rent notices", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    listResidentMatchedLeasesMock.mockResolvedValue([]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notices).toEqual([]);
    expect(rentNoticeFindManyMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident notice list completed",
      expect.objectContaining({ leaseCount: 0, noticeCount: 0 }),
    );
  });

  it("denies staff from the resident-only notices API with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Endast boende kan använda denna yta",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(listResidentMatchedLeasesMock).not.toHaveBeenCalled();
    expect(rentNoticeFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a stable correlated 401 before querying resident data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(listResidentMatchedLeasesMock).not.toHaveBeenCalled();
    expect(rentNoticeFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without exposing dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident notice list failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_notices.list.failed" }),
    );
  });
});
