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

import { GET, PATCH, POST } from "./route";

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

  it("marks a draft quote as sent and records the status change", async () => {
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
      supplier_cost: 0,
      other: 0,
      vat_rate: 25,
      note: null,
    });
    quoteDecisionCreateMock.mockResolvedValue({ id: "decision-1" });

    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "quote-1", status: "sent" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(quoteUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote-1", company_id: "company-1" },
      data: expect.objectContaining({ status: "sent" }),
    }));
    expect(quoteDecisionCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quote_id: "quote-1",
        previous_status: "draft",
        status: "sent",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "quote.status_changed",
      metadata: expect.objectContaining({ previous_status: "draft", status: "sent" }),
    }));
    expect(body).toMatchObject({ success: true, id: "quote-1", status: "sent" });
  });

  it("loads work-order links for exactly the listed quotes, not a company-wide window", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const quoteRow = (id: string, createdAt: string) => ({
      id,
      property_id: "property-1",
      property: { name: "Huset" },
      title: `Offert ${id}`,
      supplier: "Bygg AB",
      status: "approved",
      valid_until: null,
      labor: 100,
      material: 0,
      supplier_cost: 0,
      other: 0,
      subtotal: 100,
      vat_rate: 25,
      vat: 25,
      total: 125,
      note: null,
      decision_comment: null,
      decision_at: null,
      decision_by: null,
      decisions: [],
      created_at: new Date(createdAt),
    });
    quoteFindManyMock.mockResolvedValue([
      quoteRow("quote-new", "2026-10-01T10:00:00.000Z"),
      quoteRow("quote-old", "2024-01-01T10:00:00.000Z"),
    ]);
    auditFindManyMock.mockImplementation(async (args: { where: { action: string } }) => {
      if (args.where.action === "quote.work_order_created") {
        return [{ entity_id: "quote-old", metadata: { workOrderId: "wo-old", workOrderNumber: "AO-2024-0007" } }];
      }
      return [];
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    const byId = Object.fromEntries(body.quotes.map((quote: { id: string }) => [quote.id, quote]));
    expect(byId["quote-old"].work_order_id).toBe("wo-old");
    expect(byId["quote-old"].work_order_number).toBe("AO-2024-0007");
    expect(byId["quote-new"].work_order_id).toBeNull();

    const linkQuery = auditFindManyMock.mock.calls
      .map(([args]) => args)
      .find((args: { where: { action: string } }) => args.where.action === "quote.work_order_created");
    expect(linkQuery.where).toEqual({
      company_id: "company-1",
      entity_type: "quote",
      entity_id: { in: ["quote-new", "quote-old"] },
      action: "quote.work_order_created",
    });
    expect(linkQuery.take).toBeUndefined();
    // The unused company-wide decision scan was removed from the list path.
    expect(quoteDecisionFindManyMock).not.toHaveBeenCalled();
  });

  it("skips the work-order link lookup when no quotes are listed", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const response = await GET();
    expect(response.status).toBe(200);
    const linkQueries = auditFindManyMock.mock.calls
      .filter(([args]) => args.where.action === "quote.work_order_created");
    expect(linkQueries).toHaveLength(0);
  });

  it("denies technicians from reading quotes", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa offerter");
    expect(quoteFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing quotes or actor emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(quoteFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("POST denies residents before creating a quote", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", title: "Tak" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(quoteCreateMock).not.toHaveBeenCalled();
  });

  it("POST denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", title: "Tak" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(quoteCreateMock).not.toHaveBeenCalled();
  });

  it("PATCH denies residents before looking up a quote", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "quote-1", status: "sent" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(quoteFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "quote-1", status: "sent" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(quoteFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts a quote against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-tenant-b", title: "Tak" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", deleted_at: null, company_id: "company-1" },
      select: { id: true, name: true },
    });
    expect(quoteCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A patches a Tenant B quote id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "quote-tenant-b", status: "sent" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Offerten hittades inte");
    expect(quoteFindFirstMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "quote-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(quoteUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
