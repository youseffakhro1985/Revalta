import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindFirstMock,
  projectUpdateManyMock,
  txProjectFindFirstMock,
  userFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  projectUpdateManyMock: vi.fn(),
  txProjectFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
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
    },
    user: { findFirst: userFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { DELETE, GET, PATCH } from "./route";

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

const existingProject = {
  id: "project-1",
  name: "Takrenovering",
  status: "active",
  start_date: null,
  end_date: null,
};

function ownerUser() {
  return { id: "user-1", email: "owner@example.com", name: "Owner", company_id: "company-1", role: "owner" };
}

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/project-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("projects/[id] route", () => {
  const tx = {
    project: {
      updateMany: projectUpdateManyMock,
      findFirst: txProjectFindFirstMock,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ownerUser());
    projectUpdateManyMock.mockResolvedValue({ count: 1 });
    txProjectFindFirstMock.mockResolvedValue(sampleProject);
    userFindFirstMock.mockResolvedValue({ id: "manager-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("GET scopes findFirst to active properties and returns the project", async () => {
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
    const response = await PATCH(patchRequest({ name: "Nytt namn" }), { params });
    expect(response.status).toBe(403);
    expect(projectFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("GET returns 404 when project is missing or on a soft-deleted property", async () => {
    projectFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/projects/project-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
  });

  it("PATCH requires active property scope and keeps update plus audit in one transaction", async () => {
    projectFindFirstMock.mockResolvedValue(existingProject);

    const response = await PATCH(patchRequest({ name: "Takrenovering uppdaterad", budget: 120000 }), { params });

    expect(response.status).toBe(200);
    expect(projectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
      select: { id: true, status: true, start_date: true, end_date: true },
    }));
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "project-1", company_id: "company-1" },
      data: expect.objectContaining({ name: "Takrenovering uppdaterad", budget: 120000 }),
    }));
    expect(txProjectFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "project-1", company_id: "company-1" },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "project", entityId: "project-1", action: "project.updated" }),
      tx,
    );
  });

  it("PATCH rejects a partial end-date update before the stored start date", async () => {
    projectFindFirstMock.mockResolvedValueOnce({
      id: "project-1",
      status: "active",
      start_date: new Date("2026-09-10T00:00:00.000Z"),
      end_date: new Date("2026-09-30T00:00:00.000Z"),
    });

    const response = await PATCH(patchRequest({ endDate: "2026-09-05" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/slutdatum.*före startdatum/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects a partial start-date update after the stored end date", async () => {
    projectFindFirstMock.mockResolvedValueOnce({
      id: "project-1",
      status: "active",
      start_date: new Date("2026-09-10T00:00:00.000Z"),
      end_date: new Date("2026-09-30T00:00:00.000Z"),
    });

    const response = await PATCH(patchRequest({ startDate: "2026-10-05" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/slutdatum.*före startdatum/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when project is missing or on a soft-deleted property", async () => {
    projectFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ name: "Takrenovering" }), { params });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects malformed JSON before tenant lookup or mutation", async () => {
    const request = new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(projectFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("PATCH fails without false success when audit persistence fails inside the transaction", async () => {
    projectFindFirstMock.mockResolvedValue(existingProject);
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(PATCH(patchRequest({ forecast: 125000 }), { params })).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.updated" }),
      tx,
    );
  });

  it("PATCH rolls back and returns conflict if the updated project disappears before reload", async () => {
    projectFindFirstMock.mockResolvedValue(existingProject);
    txProjectFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ actual: 75000 }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/ändrades under uppdateringen/i);
    expect(projectUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("DELETE soft-deletes and audits through the same transaction", async () => {
    projectFindFirstMock.mockResolvedValue({ id: "project-1", name: "Takrenovering", status: "active" });

    const response = await DELETE(new Request("http://localhost/api/projects/project-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-1", company_id: "company-1", deleted_at: null },
      data: expect.objectContaining({ status: "cancelled", deleted_at: expect.any(Date) }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "project", entityId: "project-1", action: "project.deleted" }),
      tx,
    );
  });

  it("DELETE fails without false success when audit persistence fails inside the transaction", async () => {
    projectFindFirstMock.mockResolvedValue({ id: "project-1", name: "Takrenovering", status: "active" });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(DELETE(new Request("http://localhost/api/projects/project-1", { method: "DELETE" }), { params })).rejects.toThrow("audit unavailable");

    expect(projectUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.deleted" }),
      tx,
    );
  });

  it("DELETE returns 404 without audit when the conditional soft-delete loses the race", async () => {
    projectFindFirstMock.mockResolvedValue({ id: "project-1", name: "Takrenovering", status: "active" });
    projectUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await DELETE(new Request("http://localhost/api/projects/project-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(404);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
