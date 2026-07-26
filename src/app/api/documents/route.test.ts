import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, auditFindManyMock, propertyFindManyMock, leaseFindManyMock, lifecycleMapMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
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
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

import { GET } from "./route";

describe("documents route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([
      {
        id: "doc-1",
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

  it("scopes document audit logs by company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "document", action: "document.created" },
    }));
  });

  it("scopes document audit logs by actor for solo users and never returns dataUrl", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor_user_id: "user-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents[0].dataUrl).toBeUndefined();
  });
});
