import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindFirstMock,
  projectUpdateManyMock,
  auditLogFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  projectUpdateManyMock: vi.fn(),
  auditLogFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    project: {
      findFirst: projectFindFirstMock,
      updateMany: projectUpdateManyMock,
    },
    auditLog: {
      findFirst: auditLogFindFirstMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const params = Promise.resolve({ id: "project-1" });

describe("projects/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    projectUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("restores previousStatus from delete audit when status was forced to cancelled", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      name: "Tak",
      status: "cancelled",
      property: { deleted_at: null },
    });
    auditLogFindFirstMock.mockResolvedValue({
      metadata: { previousStatus: "active", softDelete: true },
    });

    const response = await POST(new Request("http://localhost/api/projects/project-1/restore", { method: "POST" }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("active");
    expect(projectUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "project-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null, status: "active" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.restored" }),
      expect.anything(),
    );
  });

  it("does not report success when the audit log write fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      name: "Tak",
      status: "cancelled",
      property: { deleted_at: null },
    });
    auditLogFindFirstMock.mockResolvedValue(null);
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(new Request("http://localhost/api/projects/project-1/restore", { method: "POST" }), { params });

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
