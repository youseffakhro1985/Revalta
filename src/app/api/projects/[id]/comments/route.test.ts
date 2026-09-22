import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindFirstMock,
  commentFindManyMock,
  commentCreateMock,
  auditFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  commentFindManyMock: vi.fn(),
  commentCreateMock: vi.fn(),
  auditFindManyMock: vi.fn(),
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
    project: { findFirst: projectFindFirstMock },
    projectComment: { findMany: commentFindManyMock, create: commentCreateMock },
    auditLog: { findMany: auditFindManyMock },
  },
}));

import { GET, POST } from "./route";

const params = Promise.resolve({ id: "project-1" });

describe("GET /api/projects/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectFindFirstMock.mockResolvedValue({ id: "project-1" });
    commentFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading project comments", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/projects/project-1/comments"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa projekt");
    expect(projectFindFirstMock).not.toHaveBeenCalled();
    expect(commentFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing comments or actor emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/projects/project-1/comments"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(projectFindFirstMock).not.toHaveBeenCalled();
    expect(commentFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("returns comments for managers without leaking other tenants", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    const response = await GET(new Request("http://localhost/api/projects/project-1/comments"), { params });
    expect(response.status).toBe(200);
    expect(projectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "project-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(commentFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", project_id: "project-1" },
    }));
  });

  it("POST denies residents before writing a project comment", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/projects/project-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Hej" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(projectFindFirstMock).not.toHaveBeenCalled();
  });

  it("POST denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("http://localhost/api/projects/project-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Hej" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(projectFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A lists comments on a Tenant B project id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/projects/project-tenant-b/comments"),
      { params: Promise.resolve({ id: "project-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Projektet hittades inte");
    expect(projectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "project-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(commentFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A comments on a Tenant B project id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/projects/project-tenant-b/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Tenant B kommentar" }),
    }), { params: Promise.resolve({ id: "project-tenant-b" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Projektet hittades inte");
    expect(projectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "project-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(commentCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
