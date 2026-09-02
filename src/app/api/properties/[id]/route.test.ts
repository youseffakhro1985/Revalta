import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  leaseCountMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  propertyUpdateManyMock,
  ticketCountMock,
  transactionMock,
  workOrderCountMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  leaseCountMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  propertyUpdateManyMock: vi.fn(),
  ticketCountMock: vi.fn(),
  transactionMock: vi.fn(),
  workOrderCountMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock, updateMany: propertyUpdateManyMock },
    lease: { count: leaseCountMock },
    ticket: { count: ticketCountMock },
    workOrder: { count: workOrderCountMock },
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "property-1" });
const owner = { id: "user-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };
const validPatchBody = { name: "Kvarnhuset", address: "Storgatan 1", city: "Stockholm" };
const samplePropertyRow = {
  id: "property-1",
  name: "Kvarnhuset",
  address: "Storgatan 1",
  city: "Stockholm",
  property_identifier: null,
  status: "active",
};

function patchRequest(body: unknown, id = "property-1") {
  return new Request(`http://localhost/api/properties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function deleteRequest(id = "property-1") {
  return new Request(`http://localhost/api/properties/${id}`, {
    method: "DELETE",
    headers: { "x-request-id": requestId },
  });
}

describe("properties/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    propertyUpdateManyMock.mockResolvedValue({ count: 1 });
    leaseCountMock.mockResolvedValue(0);
    ticketCountMock.mockResolvedValue(0);
    workOrderCountMock.mockResolvedValue(0);
    transactionMock.mockImplementation(async (callback) => callback({
      property: { findFirst: propertyFindFirstMock, updateMany: propertyUpdateManyMock },
      auditLog: {},
    }));
  });

  describe("PATCH", () => {
    it("updates and audits a tenant-scoped property in one transaction", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock
        .mockResolvedValueOnce({ id: "property-1" })
        .mockResolvedValueOnce(samplePropertyRow);

      const response = await PATCH(patchRequest(validPatchBody), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(requestId);
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(body.success).toBe(true);
      expect(propertyFindFirstMock).toHaveBeenNthCalledWith(1, {
        where: { id: "property-1", deleted_at: null, company_id: "company-1" },
      });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(propertyUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "property-1", company_id: "company-1", deleted_at: null },
      }));
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ action: "property.updated", entityId: "property-1" }),
        expect.anything(),
      );
      expect(loggerInfoMock).toHaveBeenCalledWith(
        "property update completed",
        expect.objectContaining({
          event: "properties.update.completed",
          userId: "user-1",
          companyId: "company-1",
          propertyId: "property-1",
        }),
      );
      const logged = JSON.stringify(loggerInfoMock.mock.calls);
      expect(logged).not.toContain("Kvarnhuset");
      expect(logged).not.toContain("Storgatan 1");
    });

    it("returns stable correlated auth errors before property access", async () => {
      getCurrentUserMock.mockResolvedValue(null);
      const unauthorized = await PATCH(patchRequest(validPatchBody), { params });
      expect(unauthorized.status).toBe(401);
      await expect(unauthorized.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
      expect(propertyFindFirstMock).not.toHaveBeenCalled();

      getCurrentUserMock.mockResolvedValue(technician);
      const forbidden = await PATCH(patchRequest(validPatchBody), { params });
      expect(forbidden.status).toBe(403);
      expect((await forbidden.json()).errorCode).toBe("FORBIDDEN");
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 without logging an unverified cross-tenant property id", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue(null);

      const response = await PATCH(patchRequest(validPatchBody, "external-secret-property"), {
        params: Promise.resolve({ id: "external-secret-property" }),
      });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.errorCode).toBe("NOT_FOUND");
      expect(body.requestId).toBe(requestId);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
      expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
    });

    it("returns correlated validation errors after tenant access without logging submitted property fields", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

      const response = await PATCH(patchRequest({ name: "Hemligt namn", address: "", city: "Stockholm" }), { params });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.errorCode).toBe("VALIDATION_FAILED");
      expect(body.requestId).toBe(requestId);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
      const logged = JSON.stringify(loggerWarnMock.mock.calls);
      expect(logged).not.toContain("Hemligt namn");
      expect(logged).not.toContain("Stockholm");
    });

    it("keeps construction-year validation and race-safe 404s", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

      const invalid = await PATCH(patchRequest({ ...validPatchBody, constructionYear: 1500 }), { params });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).errorCode).toBe("VALIDATION_FAILED");
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();

      propertyUpdateManyMock.mockResolvedValue({ count: 0 });
      const raced = await PATCH(patchRequest(validPatchBody), { params });
      expect(raced.status).toBe(404);
      expect(writeAuditLogMock).not.toHaveBeenCalled();
    });

    it("fails the transaction if the audit write fails instead of acknowledging a partial update", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock
        .mockResolvedValueOnce({ id: "property-1" })
        .mockResolvedValueOnce(samplePropertyRow);
      writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

      const response = await PATCH(patchRequest(validPatchBody), { params });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.errorCode).toBe("INTERNAL_ERROR");
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(writeAuditLogMock).toHaveBeenCalledWith(owner, expect.anything(), expect.anything());
      expect(loggerInfoMock).not.toHaveBeenCalledWith("property update completed", expect.anything());
    });

    it("returns a safe correlated 500", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

      const response = await PATCH(patchRequest(validPatchBody), { params });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
      expect(JSON.stringify(body)).not.toContain("postgres://");
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "property update failed",
        expect.any(Error),
        expect.objectContaining({ event: "properties.update.failed" }),
      );
    });
  });

  describe("DELETE", () => {
    it("soft-deletes and audits a verified tenant property in one transaction", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(requestId);
      expect(response.headers.get("cache-control")).toContain("private");
      expect(body.success).toBe(true);
      expect(leaseCountMock).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ property_id: "property-1", company_id: "company-1" }),
      }));
      expect(ticketCountMock).toHaveBeenCalled();
      expect(workOrderCountMock).toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(propertyUpdateManyMock).toHaveBeenCalledWith({
        where: { id: "property-1", company_id: "company-1", deleted_at: null },
        data: { deleted_at: expect.any(Date) },
      });
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ action: "property.deleted", entityId: "property-1" }),
        expect.anything(),
      );
      expect(loggerInfoMock).toHaveBeenCalledWith(
        "property delete completed",
        expect.objectContaining({ event: "properties.delete.completed", propertyId: "property-1" }),
      );
      expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("Kvarnhuset");
    });

    it.each([
      ["active leases", "lease", "hyresavtal"],
      ["open tickets", "ticket", "ärenden"],
      ["open work orders", "workOrder", "arbetsordrar"],
    ])("keeps the %s blocker as correlated 409", async (_label, blocker, messagePart) => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      if (blocker === "lease") leaseCountMock.mockResolvedValue(1);
      if (blocker === "ticket") ticketCountMock.mockResolvedValue(1);
      if (blocker === "workOrder") workOrderCountMock.mockResolvedValue(1);

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.errorCode).toBe("CONFLICT");
      expect(body.error).toMatch(new RegExp(messagePart));
      expect(body.requestId).toBe(requestId);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 404 for another tenant without dependency queries or id leakage", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue(null);

      const response = await DELETE(deleteRequest("external-secret-property"), {
        params: Promise.resolve({ id: "external-secret-property" }),
      });

      expect(response.status).toBe(404);
      expect(leaseCountMock).not.toHaveBeenCalled();
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
      expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
    });

    it("fails the transaction if audit persistence fails instead of acknowledging a partial delete", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.errorCode).toBe("INTERNAL_ERROR");
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(writeAuditLogMock).toHaveBeenCalledWith(owner, expect.anything(), expect.anything());
      expect(loggerInfoMock).not.toHaveBeenCalledWith("property delete completed", expect.anything());
    });

    it("returns safe correlated 500 on unexpected failure", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockRejectedValue(new Error("database-secret"));

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.errorCode).toBe("INTERNAL_ERROR");
      expect(body.requestId).toBe(requestId);
      expect(JSON.stringify(body)).not.toContain("database-secret");
    });
  });
});
