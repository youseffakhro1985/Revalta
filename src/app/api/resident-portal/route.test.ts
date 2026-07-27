import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindManyMock,
  leaseFindFirstMock,
  ticketFindManyMock,
  ticketCreateMock,
  managedDocumentFindManyMock,
  auditLogFindManyMock,
  auditLogCreateMock,
  writeAuditLogMock,
  transactionMock,
  isModernStorageOnlyMock,
  getDocumentLifecycleMapMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  managedDocumentFindManyMock: vi.fn(),
  auditLogFindManyMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
  isModernStorageOnlyMock: vi.fn(),
  getDocumentLifecycleMapMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/dual-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dual-list")>()),
  isModernStorageOnly: isModernStorageOnlyMock,
}));

vi.mock("@/lib/document-lifecycle", () => ({
  getDocumentLifecycleMap: getDocumentLifecycleMapMock,
}));

vi.mock("@/lib/public-portal", () => ({
  generatePublicReference: () => "RV-TEST-1",
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: {
      findMany: leaseFindManyMock,
      findFirst: leaseFindFirstMock,
    },
    ticket: {
      findMany: ticketFindManyMock,
      create: ticketCreateMock,
    },
    managedDocument: {
      findMany: managedDocumentFindManyMock,
    },
    auditLog: {
      findMany: auditLogFindManyMock,
      create: auditLogCreateMock,
    },
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

describe("resident-portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isModernStorageOnlyMock.mockReturnValue(true);
    getDocumentLifecycleMapMock.mockResolvedValue(new Map());
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseFindManyMock.mockResolvedValue([]);
    ticketFindManyMock.mockResolvedValue([]);
    managedDocumentFindManyMock.mockResolvedValue([]);
    auditLogFindManyMock.mockResolvedValue([]);
  });

  it("scopes resident GET to matching lease holder email", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        lease_holder: {
          deleted_at: null,
          email: { equals: "boende@exempel.se", mode: "insensitive" },
        },
      }),
    }));
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reporter_email: { equals: "boende@exempel.se", mode: "insensitive" },
      }),
    }));
    expect(body.isResident).toBe(true);
    expect(body.canCreate).toBe(true);
    expect(body.canManage).toBe(false);
  });

  it("keeps company-wide leases for staff GET", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock.mock.calls[0][0].where.lease_holder).toBeUndefined();
    expect(body.isResident).toBe(false);
    expect(body.canManage).toBe(true);
  });

  it("denies technicians from reading company-wide resident portal leases", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
      email: "tekniker@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("lets a resident create a ticket only for a matched lease", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      lease_number: "AVT-1",
      property_id: "property-1",
      unit: { designation: "1101" },
      lease_holder: {
        id: "holder-1",
        name: "Ada Boende",
        contact_name: null,
        email: "boende@exempel.se",
        phone: null,
      },
    });
    transactionMock.mockImplementation(async (callback: (tx: {
      ticket: { create: typeof ticketCreateMock };
      auditLog: { create: typeof auditLogCreateMock };
    }) => Promise<unknown>) => callback({
      ticket: { create: ticketCreateMock },
      auditLog: { create: auditLogCreateMock },
    }));
    ticketCreateMock.mockResolvedValue({ id: "ticket-1", public_reference: "RV-TEST-1" });

    const response = await POST(new Request("http://localhost/api/resident-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaseId: "lease-1",
        subject: "Läckage",
        message: "Det droppar under diskbänken sedan igår.",
        category: "plumbing",
        priority: "high",
      }),
    }));

    expect(response.status).toBe(201);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        lease_holder: {
          deleted_at: null,
          email: { equals: "boende@exempel.se", mode: "insensitive" },
        },
      }),
    }));
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reporter_email: "boende@exempel.se",
        source: "resident_portal",
      }),
    }));
  });

  it("returns 404 when resident tries another lease", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/resident-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaseId: "lease-other",
        subject: "Läckage",
        message: "Det droppar under diskbänken sedan igår.",
        category: "plumbing",
        priority: "high",
      }),
    }));

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("blocks viewer from creating tickets", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "viewer",
      email: "lasare@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/resident-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaseId: "lease-1",
        subject: "Läckage",
        message: "Det droppar under diskbänken sedan igår.",
      }),
    }));

    expect(response.status).toBe(403);
  });
});
