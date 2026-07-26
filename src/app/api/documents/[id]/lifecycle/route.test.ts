import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  managedFindFirstMock,
  managedUpdateManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  managedFindFirstMock: vi.fn(),
  managedUpdateManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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
    managedDocument: {
      findFirst: managedFindFirstMock,
      updateMany: managedUpdateManyMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

import { PATCH } from "./route";

const params = Promise.resolve({ id: "doc-1" });

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/documents/doc-1/lifecycle", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("documents/[id]/lifecycle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managedUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern ManagedDocument lifecycle on active (or unscoped) properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindFirstMock.mockResolvedValue({
      id: "doc-1",
      name: "Ordningsregler",
      visibility: "internal",
      lifecycle_state: "active",
    });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, state: "archived" });
    expect(managedFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "doc-1",
        company_id: "company-1",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }));
    expect(managedUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-1", company_id: "company-1" },
      data: { lifecycle_state: "archived" },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "document.archived",
    }));
  });

  it("returns 404 for orphaned documents on soft-deleted properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "doc-1" });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
    expect(managedUpdateManyMock).not.toHaveBeenCalled();
    expect(auditFindFirstMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy AuditLog documents with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(patchRequest({ transition: "archive" }), {
      params: Promise.resolve({ id: "legacy-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(managedUpdateManyMock).not.toHaveBeenCalled();
  });
});
