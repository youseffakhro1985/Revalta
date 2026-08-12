import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  managedFindManyMock,
  managedCountMock,
  managedGroupByMock,
  auditFindManyMock,
  propertyFindManyMock,
  leaseFindManyMock,
  lifecycleMapMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  managedFindManyMock: vi.fn(),
  managedCountMock: vi.fn(),
  managedGroupByMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  lifecycleMapMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/document-lifecycle", () => ({ getDocumentLifecycleMap: lifecycleMapMock }));
vi.mock("@/lib/document-file-security", () => ({ validateDocumentFile: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: { findMany: managedFindManyMock, count: managedCountMock, groupBy: managedGroupByMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

import { GET } from "./route";

describe("documents route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVALTA_MODERN_STORAGE_ONLY", "0");
    managedFindManyMock.mockResolvedValue([]);
    managedCountMock.mockResolvedValue(0);
    managedGroupByMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([
      {
        id: "doc-1",
        entity_id: null,
        metadata: {
          name: "Hyresavtal",
          dataUrl: "data:application/pdf;base64,SECRET",
          fileName: "avtal.pdf",
          sizeBytes: 123,
        },
        created_at: new Date("2026-07-01T10:00:00Z"),
        actor: { name: "Anna", email: "anna@example.se" },
      },
    ]);
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    lifecycleMapMock.mockResolvedValue(new Map());
  });

  it("scopes document audit logs by company and prefers ManagedDocument rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindManyMock.mockResolvedValue([
      {
        id: "modern-1",
        name: "Ordningsregler",
        category: "rules",
        visibility: "internal",
        lifecycle_state: "active",
        updated_at: new Date("2026-07-02T10:00:00Z"),
        valid_until: null,
        file_name: "regler.pdf",
        content_type: "application/pdf",
        size_bytes: 200,
        property_id: null,
        unit_id: null,
        lease_id: null,
        created_by: { name: "Bo", email: "bo@example.se" },
        created_at: new Date("2026-07-02T10:00:00Z"),
      },
    ]);
    auditFindManyMock.mockResolvedValue([
      {
        id: "audit-modern",
        entity_id: "modern-1",
        metadata: { name: "Ordningsregler", storage: "ManagedDocument" },
        created_at: new Date("2026-07-02T10:00:00Z"),
        actor: { name: "Bo", email: "bo@example.se" },
      },
      {
        id: "doc-1",
        entity_id: null,
        metadata: {
          name: "Hyresavtal",
          dataUrl: "data:application/pdf;base64,SECRET",
          fileName: "avtal.pdf",
          sizeBytes: 123,
        },
        created_at: new Date("2026-07-01T10:00:00Z"),
        actor: { name: "Anna", email: "anna@example.se" },
      },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/documents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managedFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        company_id: "company-1",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents).toHaveLength(2);
    expect(body.documents[0].id).toBe("modern-1");
    expect(body.documents[0].downloadUrl).toBe("/api/documents/modern-1/download");
    expect(body.documents[0].dataUrl).toBeUndefined();
    expect(body.documents[1].id).toBe("doc-1");
    expect(body.documents[1].dataUrl).toBeUndefined();
  });

  it("scopes document audit logs by actor for solo users and never returns dataUrl", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    const response = await GET(new Request("https://www.revalta.se/api/documents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor_user_id: "user-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents[0].dataUrl).toBeUndefined();
    expect(body.documents[0].downloadUrl).toBe("/api/documents/doc-1/download");
  });

  it("omits company lease dump for technicians", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("https://www.revalta.se/api/documents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(body.leases).toEqual([]);
  });

  it("uses database pagination, filters and global summaries after modern cutover", async () => {
    vi.stubEnv("REVALTA_MODERN_STORAGE_ONLY", "1");
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    managedCountMock.mockResolvedValueOnce(73).mockResolvedValueOnce(4);
    managedGroupByMock.mockResolvedValue([
      { lifecycle_state: "active", _count: { _all: 12 } },
      { lifecycle_state: "unpublished", _count: { _all: 3 } },
      { lifecycle_state: "archived", _count: { _all: 8 } },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/documents?page=2&pageSize=25&search=OVK&category=ovk&lifecycle=active"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managedFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25,
      take: 25,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      where: expect.objectContaining({
        company_id: "company-1",
        category: "ovk",
        lifecycle_state: "active",
        AND: expect.any(Array),
      }),
    }));
    expect(auditFindManyMock).not.toHaveBeenCalled();
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 73, totalPages: 3 });
    expect(body.summary).toEqual({ active: 12, unpublished: 3, archived: 8, residentPublished: 4 });
  });
});
