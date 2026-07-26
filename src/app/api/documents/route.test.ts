import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  managedFindManyMock,
  auditFindManyMock,
  propertyFindManyMock,
  leaseFindManyMock,
  lifecycleMapMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  managedFindManyMock: vi.fn(),
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
    managedDocument: { findMany: managedFindManyMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

import { GET } from "./route";

describe("documents route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managedFindManyMock.mockResolvedValue([]);
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

    const response = await GET();
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
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor_user_id: "user-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents[0].dataUrl).toBeUndefined();
    expect(body.documents[0].downloadUrl).toBe("/api/documents/doc-1/download");
  });
});
