import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  operationFindManyMock,
  operationFindFirstMock,
  operationUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  operationFindManyMock: vi.fn(),
  operationFindFirstMock: vi.fn(),
  operationUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
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
    ticket: { findFirst: ticketFindFirstMock },
    ticketOperation: {
      findMany: operationFindManyMock,
      findFirst: operationFindFirstMock,
      updateMany: operationUpdateManyMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
  },
}));

import { DELETE, GET, PATCH } from "./route";

describe("ticket operations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", company_id: "company-1", title: "Läckage" });
    auditFindManyMock.mockResolvedValue([]);
  });

  it("returns modern ticket operations with legacy action shape", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    operationFindManyMock.mockResolvedValue([
      {
        id: "op-1",
        operation_type: "time",
        description: "Arbete",
        minutes: 45,
        amount: null,
        completed: null,
        ticket_title: "Läckage",
        created_at: new Date("2026-07-20T10:00:00Z"),
        created_by: { name: "Anna", email: "anna@example.se" },
      },
    ]);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(operationFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", ticket_id: "ticket-1", deleted_at: null },
    }));
    expect(body.operations[0].action).toBe("workorder.time.added");
    expect(body.operations[0].metadata.minutes).toBe(45);
  });

  it("updates modern ticket operation fields and rejects legacy rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    operationFindFirstMock
      .mockResolvedValueOnce({
        id: "op-1",
        operation_type: "time",
        description: "Arbete",
        minutes: 45,
        amount: null,
        completed: null,
        ticket_title: "Läckage",
        created_at: new Date("2026-07-20T10:00:00Z"),
        created_by: { name: "Anna", email: "anna@example.se" },
      })
      .mockResolvedValueOnce({
        id: "op-1",
        operation_type: "time",
        description: "Uppdaterat arbete",
        minutes: 60,
        amount: null,
        completed: null,
        ticket_title: "Läckage",
        created_at: new Date("2026-07-20T10:00:00Z"),
        created_by: { name: "Anna", email: "anna@example.se" },
      });
    operationUpdateManyMock.mockResolvedValue({ count: 1 });

    const ok = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: "op-1", description: "Uppdaterat arbete", minutes: 60 }),
    }), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await ok.json();

    expect(ok.status).toBe(200);
    expect(operationUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "op-1",
        company_id: "company-1",
        ticket_id: "ticket-1",
        deleted_at: null,
      },
      data: { description: "Uppdaterat arbete", minutes: 60 },
    }));
    expect(body.operation.metadata.minutes).toBe(60);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "workorder.operation.updated",
    }));

    operationFindFirstMock.mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-op", metadata: { storage: "AuditLog" } });
    const legacy = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: "legacy-op", description: "x" }),
    }), { params: Promise.resolve({ id: "ticket-1" }) });
    expect(legacy.status).toBe(409);
    expect((await legacy.json()).error).toMatch(/backfill/i);
  });

  it("soft-deletes modern ticket operations and rejects legacy rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    operationFindFirstMock.mockResolvedValueOnce({ id: "op-1", operation_type: "note" });
    operationUpdateManyMock.mockResolvedValue({ count: 1 });

    const ok = await DELETE(new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: "op-1" }),
    }), { params: Promise.resolve({ id: "ticket-1" }) });
    expect(ok.status).toBe(200);
    expect(operationUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "op-1",
        company_id: "company-1",
        ticket_id: "ticket-1",
        deleted_at: null,
      },
      data: { deleted_at: expect.any(Date) },
    }));

    operationFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-op", metadata: { storage: "AuditLog" } });
    const legacy = await DELETE(new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: "legacy-op" }),
    }), { params: Promise.resolve({ id: "ticket-1" }) });
    expect(legacy.status).toBe(409);
    expect((await legacy.json()).error).toMatch(/backfill/i);
  });
});
