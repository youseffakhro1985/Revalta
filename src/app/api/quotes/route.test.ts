import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  quoteFindManyMock,
  quoteFindFirstMock,
  quoteCreateMock,
  quoteUpdateManyMock,
  quoteDecisionFindManyMock,
  quoteDecisionCreateMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  quoteFindManyMock: vi.fn(),
  quoteFindFirstMock: vi.fn(),
  quoteCreateMock: vi.fn(),
  quoteUpdateManyMock: vi.fn(),
  quoteDecisionFindManyMock: vi.fn(),
  quoteDecisionCreateMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
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
    quote: {
      findMany: quoteFindManyMock,
      findFirst: quoteFindFirstMock,
      updateMany: quoteUpdateManyMock,
      create: quoteCreateMock,
    },
    quoteDecision: {
      findMany: quoteDecisionFindManyMock,
      create: quoteDecisionCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { PATCH, POST } from "./route";

describe("quotes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteFindManyMock.mockResolvedValue([]);
    quoteDecisionFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    quoteUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it.each(["approved", "rejected", "invoiced", "cancelled"])(
    "rejects terminal initial quote status %s before writes",
    async (status) => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-1",
        company_id: "company-1",
        role: "owner",
        name: "Anna",
        email: "anna@example.se",
      });

      const response = await POST(new Request("http://localhost/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: "property-1",
          title: "Takrenovering",
          status,
          labor: 1000,
          vatRate: 25,
        }),
      }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/utkast|skickade|beslutsstatus/i);
      expect(propertyFindFirstMock).not.toHaveBeenCalled();
      expect(quoteCreateMock).not.toHaveBeenCalled();
      expect(quoteDecisionCreateMock).not.toHaveBeenCalled();
      expect(writeAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("allows sent as an initial quote status without fabricating decision history", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Anna",
      email: "anna@example.se",
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Fastighet 1" });
    quoteCreateMock.mockResolvedValue({
      id: "quote-1",
      created_at: new Date("2026-08-31T10:00:00.000Z"),
    });

    const response = await POST(new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        title: "Takrenovering",
        status: "sent",
        labor: 1000,
        material: 500,
        vatRate: 25,
      }),
    }));

    expect(response.status).toBe(201);
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "property-1", deleted_at: null, company_id: "company-1" },
    }));
    expect(quoteCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        status: "sent",
        subtotal: 1500,
        vat: 375,
        total: 1875,
      }),
    }));
    expect(quoteDecisionCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "quote.created",
      entityId: "quote-1",
      metadata: expect.objectContaining({ status: "sent", storage: "Quote" }),
    }));
  });

  it("updates modern draft quote fields and scopes active properties", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Anna",
      email: "anna@example.se",
    });
    quoteFindFirstMock.mockResolvedValue({
      id: "quote-1",
      property_id: "property-1",
      title: "Takrenovering",
      supplier: "Bygg AB",
      status: "draft",
      valid_until: null,
      labor: 1000,
      material: 500,
      supplier_cost: 200,
      other: 0,
      vat_rate: 25,
      note: null,
    });

    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId: "quote-1",
        title: "Takrenovering uppdaterad",
        supplier: "Nytt Bygg AB",
        labor: 1500,
        material: 600,
        supplierCost: 250,
        other: 50,
        vatRate: 25,
        note: "Justerad offert",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(quoteFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(quoteUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote-1", company_id: "company-1" },
      data: expect.objectContaining({
        title: "Takrenovering uppdaterad",
        supplier: "Nytt Bygg AB",
        labor: 1500,
        material: 600,
        supplier_cost: 250,
        other: 50,
        subtotal: 2400,
        vat: 600,
        total: 3000,
        note: "Justerad offert",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "quote.updated",
      entityId: "quote-1",
    }));
    expect(body).toMatchObject({
      success: true,
      id: "quote-1",
      status: "draft",
      subtotal: 2400,
      vat: 600,
      total: 3000,
    });
  });

  it("fail-closes legacy quote updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "legacy-1", title: "Legacy" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(quoteUpdateManyMock).not.toHaveBeenCalled();
  });
});
