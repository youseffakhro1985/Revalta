import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  auditFindManyMock,
  inspectionRoundFindManyMock,
  inspectionRoundCreateMock,
  propertyFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  inspectionRoundFindManyMock: vi.fn(),
  inspectionRoundCreateMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
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
    inspectionRound: { findMany: inspectionRoundFindManyMock, create: inspectionRoundCreateMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findFirst: propertyFindFirstMock },
  },
}));

import { GET, POST } from "./route";

describe("rounds route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([]);
    inspectionRoundFindManyMock.mockResolvedValue([]);
  });

  it("uses company-scoped table + legacy audit rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(inspectionRoundFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "round" },
    }));
  });

  it("rejects callers without organisation before listing rounds", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect(inspectionRoundFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing inspection rounds", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    const response = await GET();

    expect(response.status).toBe(403);
    expect(inspectionRoundFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });
});

describe("rounds POST staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before creating a round", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Brandrond", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(inspectionRoundFindManyMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(new Request("http://localhost/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Brandrond", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
  });

  it("rejects callers without organisation before creating a round", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

    const response = await POST(new Request("http://localhost/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Brandrond", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("returns tenant-safe 404 when Tenant A posts a round against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Brandrond Tenant B",
        propertyId: "property-tenant-b",
        interval: "monthly",
        checklist: ["Utrymningsväg"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "property-tenant-b", company_id: "company-1", deleted_at: null }),
    }));
    expect(inspectionRoundCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
