import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindFirstMock,
  projectUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  projectUpdateManyMock: vi.fn(),
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
    project: {
      findFirst: projectFindFirstMock,
      updateMany: projectUpdateManyMock,
    },
  },
}));

import { GET, PATCH } from "./route";

const params = Promise.resolve({ id: "project-1" });

const sampleProject = {
  id: "project-1",
  name: "Takrenovering",
  status: "active",
  manager_id: null,
  budget: { toString: () => "100000" },
  forecast: { toString: () => "110000" },
  actual: { toString: () => "50000" },
};

describe("projects/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("GET scopes findFirst to active properties and returns the project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue(sampleProject);

    const response = await GET(new Request("http://localhost/api/projects/project-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(body.project.id).toBe("project-1");
  });

  it("denies technicians from reading projects", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/projects/project-1"), { params });
    expect(response.status).toBe(403);
    expect(projectFindFirstMock).not.toHaveBeenCalled();
  });

  it("denies technicians from mutating projects", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nytt namn" }),
    }), { params });
    expect(response.status).toBe(403);
    expect(projectFindFirstMock).not.toHaveBeenCalled();
  });

  it("GET returns 404 when project is missing or on a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/projects/project-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
  });

  it("PATCH requires active property filter on findFirst", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock
      .mockResolvedValueOnce({ id: "project-1", status: "active", start_date: null, end_date: null })
      .mockResolvedValueOnce(sampleProject);

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Takrenovering uppdaterad" }),
    }), { params });

    expect(response.status).toBe(200);
    expect(projectFindFirstMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "project-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
      select: { id: true, status: true, start_date: true, end_date: true },
    }));
    expect(projectUpdateManyMock).toHaveBeenCalled();
  });

  it("PATCH rejects a partial end-date update before the stored start date", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValueOnce({
      id: "project-1",
      status: "active",
      start_date: new Date("2026-09-10T00:00:00.000Z"),
      end_date: new Date("2026-09-30T00:00:00.000Z"),
    });

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate: "2026-09-05" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/slutdatum.*före startdatum/i);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects a partial start-date update after the stored end date", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValueOnce({
      id: "project-1",
      status: "active",
      start_date: new Date("2026-09-10T00:00:00.000Z"),
      end_date: new Date("2026-09-30T00:00:00.000Z"),
    });

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: "2026-10-05" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/slutdatum.*före startdatum/i);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when project is missing or on a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    projectFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Takrenovering" }),
    }), { params });

    expect(response.status).toBe(404);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
  });
});
