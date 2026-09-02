import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  commentCreateMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  commentCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => ({
  default: {
    workOrderComment: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };
const tx = { workOrderComment: { create: commentCreateMock } };

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("work-order comment mutation reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.com",
      name: "Manager",
      role: "manager",
      company_id: "company-1",
    });
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "wo-1", assigned_to_id: null, title: "Arbetsorder" });
    commentCreateMock.mockResolvedValue({
      id: "comment-1",
      body: "Kontroll utförd",
      is_internal: true,
      created_at: new Date("2026-09-02T10:00:00.000Z"),
      user: { id: "manager-1", name: "Manager", email: "manager@example.com" },
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates the comment and mandatory audit record in one transaction", async () => {
    const response = await POST(request({ body: "Kontroll utförd", isInternal: true }), params);

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(commentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        work_order_id: "wo-1",
        user_id: "manager-1",
        body: "Kontroll utförd",
        is_internal: true,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "work_order", entityId: "wo-1", action: "work_order.comment_added" }),
      tx,
    );
  });

  it("does not report success when comment audit persistence fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({ body: "Kontroll utförd" }), params)).rejects.toThrow("audit unavailable");

    expect(commentCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.comment_added" }),
      tx,
    );
  });

  it("rejects malformed JSON before opening a write transaction", async () => {
    const malformed = new Request("https://www.revalta.se/api/work-orders/wo-1/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(malformed, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(commentCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
