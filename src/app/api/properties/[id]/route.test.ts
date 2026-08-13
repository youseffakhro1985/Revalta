import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  propertyUpdateManyMock,
  leaseCountMock,
  ticketCountMock,
  workOrderCountMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  propertyUpdateManyMock: vi.fn(),
  leaseCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  workOrderCountMock: vi.fn(),
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
    property: {
      findFirst: propertyFindFirstMock,
      updateMany: propertyUpdateManyMock,
    },
    lease: {
      count: leaseCountMock,
    },
    ticket: {
      count: ticketCountMock,
    },
    workOrder: {
      count: workOrderCountMock,
    },
  },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ id: "property-1" });

const owner = { id: "user-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };

const validPatchBody = {
  name: "Kvarnhuset",
  address: "Storgatan 1",
  city: "Stockholm",
};

const samplePropertyRow = {
  id: "property-1",
  name: "Kvarnhuset",
  address: "Storgatan 1",
  city: "Stockholm",
  property_identifier: null,
  status: "active",
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/properties/property-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/properties/property-1", { method: "DELETE" });
}

describe("properties/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    propertyUpdateManyMock.mockResolvedValue({ count: 1 });
    leaseCountMock.mockResolvedValue(0);
    ticketCountMock.mockResolvedValue(0);
    workOrderCountMock.mockResolvedValue(0);
  });

  describe("PATCH", () => {
    it("updates a property scoped to the user's company and writes an audit log", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock
        .mockResolvedValueOnce({ id: "property-1" })
        .mockResolvedValueOnce(samplePropertyRow);

      const response = await PATCH(patchRequest(validPatchBody), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.property.id).toBe("property-1");

      expect(propertyFindFirstMock).toHaveBeenNthCalledWith(1, {
        where: { id: "property-1", deleted_at: null, company_id: "company-1" },
      });
      expect(propertyUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "property-1", company_id: "company-1", deleted_at: null },
        }),
      );
      expect(propertyFindFirstMock).toHaveBeenNthCalledWith(2, {
        where: { id: "property-1", company_id: "company-1", deleted_at: null },
      });
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ action: "property.updated", entityId: "property-1" }),
      );
    });

    it("returns 401 when there is no authenticated user", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(401);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role without property-editing permission", async () => {
      getCurrentUserMock.mockResolvedValue(technician);

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(403);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the user has no company", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(400);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 (not a leaked cross-tenant record) when the property does not belong to the user's company", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue(null);

      const response = await PATCH(patchRequest(validPatchBody), { params });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toMatch(/hittades inte/i);
      expect(propertyFindFirstMock).toHaveBeenCalledWith({
        where: { id: "property-1", deleted_at: null, company_id: "company-1" },
      });
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 400 when required fields are missing", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

      const response = await PATCH(patchRequest({ name: "", address: "Storgatan 1", city: "Stockholm" }), { params });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/Namn, adress och ort krävs/);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid construction year", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

      const response = await PATCH(
        patchRequest({ ...validPatchBody, constructionYear: 1500 }),
        { params },
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/byggår/);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 404 when updateMany affects no rows (race with deletion)", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
      propertyUpdateManyMock.mockResolvedValue({ count: 0 });

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(404);
    });

    it("returns 404 when the post-update re-fetch finds nothing", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock
        .mockResolvedValueOnce({ id: "property-1" })
        .mockResolvedValueOnce(null);

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(404);
      expect(writeAuditLogMock).not.toHaveBeenCalled();
    });

    it("returns 500 when an unexpected error is thrown", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockRejectedValue(new Error("db unavailable"));

      const response = await PATCH(patchRequest(validPatchBody), { params });

      expect(response.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("soft-deletes a property scoped to the user's company and writes an audit log", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      expect(propertyFindFirstMock).toHaveBeenCalledWith({
        where: { id: "property-1", company_id: "company-1", deleted_at: null },
        select: { id: true, name: true, status: true },
      });
      expect(leaseCountMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ property_id: "property-1", company_id: "company-1" }) }),
      );
      expect(ticketCountMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ property_id: "property-1", company_id: "company-1" }) }),
      );
      expect(workOrderCountMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ property_id: "property-1", company_id: "company-1" }) }),
      );
      expect(propertyUpdateManyMock).toHaveBeenCalledWith({
        where: { id: "property-1", company_id: "company-1", deleted_at: null },
        data: { deleted_at: expect.any(Date) },
      });
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ action: "property.deleted", entityId: "property-1" }),
      );
    });

    it("returns 401 when there is no authenticated user", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await DELETE(deleteRequest(), { params });

      expect(response.status).toBe(401);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role without property-deleting permission", async () => {
      getCurrentUserMock.mockResolvedValue(technician);

      const response = await DELETE(deleteRequest(), { params });

      expect(response.status).toBe(403);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the user has no company", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

      const response = await DELETE(deleteRequest(), { params });

      expect(response.status).toBe(400);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 (not a leaked cross-tenant record) when the property does not belong to the user's company", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue(null);

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toMatch(/hittades inte/i);
      expect(leaseCountMock).not.toHaveBeenCalled();
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 409 when the property has active or upcoming leases", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      leaseCountMock.mockResolvedValue(1);

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toMatch(/hyresavtal/);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 409 when the property has open tickets", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      ticketCountMock.mockResolvedValue(1);

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toMatch(/ärenden/);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 409 when the property has open work orders", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      workOrderCountMock.mockResolvedValue(1);

      const response = await DELETE(deleteRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toMatch(/arbetsordrar/);
      expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    });

    it("returns 404 when updateMany affects no rows (race with deletion)", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset", status: "active" });
      propertyUpdateManyMock.mockResolvedValue({ count: 0 });

      const response = await DELETE(deleteRequest(), { params });

      expect(response.status).toBe(404);
      expect(writeAuditLogMock).not.toHaveBeenCalled();
    });

    it("returns 500 when an unexpected error is thrown", async () => {
      getCurrentUserMock.mockResolvedValue(owner);
      propertyFindFirstMock.mockRejectedValue(new Error("db unavailable"));

      const response = await DELETE(deleteRequest(), { params });

      expect(response.status).toBe(500);
    });
  });
});
