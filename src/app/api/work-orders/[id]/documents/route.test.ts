import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(), workOrder: vi.fn(), findMany: vi.fn(),
  create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
  unsafeCreate: vi.fn(), unsafeAudit: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("@/lib/current-user", async () => ({
  ...await import("@/lib/permissions"),
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/db", () => ({ default: {
  workOrder: { findFirst: mocks.workOrder },
  operationalDocument: { findMany: mocks.findMany, create: mocks.unsafeCreate },
  auditLog: { create: mocks.unsafeAudit },
  $transaction: mocks.transaction,
} }));

import { DELETE, GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-a" }) };
const url = "https://www.revalta.se/api/work-orders/wo-a/documents";
const user = { id: "staff-a", company_id: "company-a", role: "manager" };
const document = {
  id: "doc-a", file_name: "rapport.pdf", category: "report", visibility: "internal",
  content_type: "application/pdf", size_bytes: 10, version: 1, created_at: new Date(),
  uploaded_by: { id: user.id, name: "Test", email: "qa@example.invalid" },
};
const tx = {
  operationalDocument: { create: mocks.create, findFirst: mocks.findFirst, updateMany: mocks.updateMany },
  auditLog: { create: mocks.audit },
};

function upload(options: { category?: string; visibility?: string; content?: string; file?: boolean } = {}) {
  const form = new FormData();
  if (options.file !== false) form.set("file", new File([options.content ?? "%PDF-1.4\n"], "rapport.pdf", { type: "application/pdf" }));
  form.set("category", options.category ?? "report");
  form.set("visibility", options.visibility ?? "internal");
  form.set("company_id", "company-b");
  return new Request(url, { method: "POST", body: form, headers: { "x-request-id": "document-test-request" } });
}

function deletion(documentId = "doc-a") {
  return new Request(`${url}?documentId=${documentId}`, { method: "DELETE" });
}

async function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBeTruthy();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-blob-token");
  vi.stubEnv("STORAGE_PROVIDER_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.currentUser.mockResolvedValue(user);
  mocks.workOrder.mockResolvedValue({ id: "wo-a", assigned_to_id: user.id });
  mocks.findMany.mockResolvedValue([document]);
  mocks.create.mockResolvedValue(document);
  mocks.findFirst.mockResolvedValue(document);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.audit.mockResolvedValue({ id: "audit-a" });
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.put.mockResolvedValue({ url: "https://test.private.blob.vercel-storage.com/doc-a" });
  mocks.del.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("work-order documents authorization and isolation", () => {
  it.each(["GET", "POST", "DELETE"])("requires authentication for %s", async (method) => {
    mocks.currentUser.mockResolvedValue(null);
    const response = method === "GET" ? await GET(new Request(url), params)
      : method === "POST" ? await POST(upload(), params) : await DELETE(deletion(), params);
    expect(response.status).toBe(401);
    expect(mocks.workOrder).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expectPrivate(response);
  });

  it.each(["resident", "vendor", "unknown"])("denies staff documents to %s", async (role) => {
    mocks.currentUser.mockResolvedValue({ ...user, role });
    expect((await GET(new Request(url), params)).status).toBe(403);
    expect((await POST(upload(), params)).status).toBe(403);
    expect((await DELETE(deletion(), params)).status).toBe(403);
    expect(mocks.workOrder).not.toHaveBeenCalled();
  });

  it("fails closed without a company", async () => {
    mocks.currentUser.mockResolvedValue({ ...user, company_id: null });
    expect((await GET(new Request(url), params)).status).toBe(400);
    expect(mocks.workOrder).not.toHaveBeenCalled();
  });

  it("scopes all work-order access to the session company and hides Company B", async () => {
    mocks.workOrder.mockResolvedValue(null);
    expect((await POST(upload(), params)).status).toBe(404);
    expect((await GET(new Request(url), params)).status).toBe(404);
    expect((await DELETE(deletion(), params)).status).toBe(404);
    expect(mocks.workOrder).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "wo-a", company_id: "company-a", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies technicians an unassigned work order", async () => {
    mocks.currentUser.mockResolvedValue({ ...user, role: "technician" });
    mocks.workOrder.mockResolvedValue({ id: "wo-a", assigned_to_id: "other-technician" });
    expect((await GET(new Request(url), params)).status).toBe(404);
    expect((await POST(upload(), params)).status).toBe(404);
    expect((await DELETE(deletion(), params)).status).toBe(404);
  });

  it("allows viewer reads but denies both mutations", async () => {
    mocks.currentUser.mockResolvedValue({ ...user, role: "viewer" });
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect((await response.json()).canManage).toBe(false);
    expect((await POST(upload(), params)).status).toBe(403);
    expect((await DELETE(deletion(), params)).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns protected URLs with stable ordering and private caching", async () => {
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    await expectPrivate(response);
    expect((await response.json()).documents[0].storage_url).toBe("/api/work-orders/wo-a/documents/doc-a");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-a", work_order_id: "wo-a", deleted_at: null },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }));
  });
});

describe("work-order document persistence and audit", () => {
  it("commits uploads and their audit on the same transaction client", async () => {
    const response = await POST(upload(), params);
    expect(response.status).toBe(201);
    await expectPrivate(response);
    expect(mocks.put).toHaveBeenCalledWith(expect.stringContaining("work-orders/company-a/wo-a/"), expect.any(Buffer), expect.objectContaining({ access: "private" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      company_id: "company-a", work_order_id: "wo-a", uploaded_by_id: user.id,
    }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      company_id: "company-a", action: "work_order.document_uploaded", entity_id: "wo-a",
    }) }));
    expect(mocks.unsafeCreate).not.toHaveBeenCalled();
    expect(mocks.unsafeAudit).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect((await response.json()).document.storage_url).toBe("/api/work-orders/wo-a/documents/doc-a");
  });

  it.each(["create", "audit"])("compensates the blob when the %s step aborts the transaction", async (step) => {
    mocks[step as "create" | "audit"].mockRejectedValue(new Error("private provider or database details"));
    const response = await POST(upload(), params);
    expect(response.status).toBe(500);
    await expectPrivate(response);
    expect(await response.text()).not.toContain("private provider");
    expect(mocks.del).toHaveBeenCalledWith("https://test.private.blob.vercel-storage.com/doc-a", { token: "test-only-blob-token" });
    expect(mocks.unsafeCreate).not.toHaveBeenCalled();
    expect(mocks.unsafeAudit).not.toHaveBeenCalled();
  });

  it("retains a safe, observable failure if compensation also fails", async () => {
    mocks.audit.mockRejectedValue(new Error("database failed"));
    mocks.del.mockRejectedValue(new Error("private-token-in-provider-error"));
    const response = await POST(upload(), params);
    expect(response.status).toBe(500);
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).toContain("upload_cleanup_failed");
    expect(logs).not.toContain("private-token-in-provider-error");
  });

  it("does not create database records when the provider fails", async () => {
    mocks.put.mockRejectedValue(new Error("private-provider-response"));
    const response = await POST(upload(), params);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-provider-response");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("soft-deletes within the same transaction as audit, retaining the blob", async () => {
    const response = await DELETE(deletion(), params);
    expect(response.status).toBe(200);
    await expectPrivate(response);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-a", company_id: "company-a", work_order_id: "wo-a", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "work_order.document_deleted" }) }));
    expect(mocks.unsafeAudit).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("rejects a foreign document ID without mutation", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await DELETE(deletion("doc-company-b"), params)).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "doc-company-b", company_id: "company-a", work_order_id: "wo-a", deleted_at: null,
    } }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not audit a lost concurrent deletion claim", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(deletion(), params)).status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("propagates deletion audit failure through the transaction rollback boundary", async () => {
    let committed = false;
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      committed = true;
      return result;
    });
    mocks.audit.mockRejectedValue(new Error("private audit details"));
    const response = await DELETE(deletion(), params);
    expect(response.status).toBe(500);
    expect(committed).toBe(false);
    expect(await response.text()).not.toContain("private audit details");
  });
});

describe("document validation and safe failures", () => {
  it.each([
    { file: false }, { category: "bogus" }, { visibility: "public" }, { content: "not a pdf" }, { content: "" },
  ])("rejects invalid uploads before provider access: %j", async (options) => {
    expect((await POST(upload(options), params)).status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart input", async () => {
    expect((await POST(new Request(url, { method: "POST", body: "bad form" }), params)).status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("fails closed when storage is not configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect((await POST(upload(), params)).status).toBe(503);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("requires a document ID for deletion", async () => {
    expect((await DELETE(new Request(url, { method: "DELETE" }), params)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns a safe correlated error for failed listing", async () => {
    mocks.findMany.mockRejectedValue(new Error("private SQL details"));
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(500);
    await expectPrivate(response);
    expect(await response.text()).not.toContain("private SQL details");
  });
});
