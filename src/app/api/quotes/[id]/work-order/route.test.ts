import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  quoteFindFirstMock,
  auditFindFirstMock,
  vendorFindFirstMock,
  writeAuditLogMock,
  transactionMock,
  hasVendorColumnMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  quoteFindFirstMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  vendorFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
  hasVendorColumnMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasWorkOrderVendorContractColumn: hasVendorColumnMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    quote: { findFirst: quoteFindFirstMock },
    auditLog: { findFirst: auditFindFirstMock },
    vendorContract: { findFirst: vendorFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  allocateWorkOrderNumber: vi.fn().mockResolvedValue("AO-0012"),
  setWorkOrderEnterpriseFields: vi.fn().mockResolvedValue(undefined),
  addWorkOrderStatusEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/work-order-asset-links", () => ({
  setWorkOrderAssetLinks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@prisma/client", () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));

vi.mock("@/lib/vendor-notify", () => ({
  notifyVendor: vi.fn().mockResolvedValue({ emailed: true }),
}));

import { POST } from "./route";
import { notifyVendor } from "@/lib/vendor-notify";

const validQuote = {
  id: "quote-1",
  company_id: "company-1",
  property_id: "property-1",
  title: "Takrenovering",
  supplier: "Städ AB",
  status: "approved",
  note: "Utför enligt offert",
  subtotal: 12000,
  property: { id: "property-1", name: "Storgatan 1" },
};

describe("quotes/[id]/work-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindFirstMock.mockResolvedValue(null);
    vendorFindFirstMock.mockResolvedValue(null);
    hasVendorColumnMock.mockResolvedValue(true);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockResolvedValue({ conflict: null, workOrderId: "wo-1", workOrderNumber: "AO-0012" });
  });

  it("returns 404 when creating work order for a quote on a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "quote-1" });

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "quote-1" }) });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 for a rejected quote", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue({ ...validQuote, status: "rejected" });

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "quote-1" }) });

    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 for a draft quote", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue({ ...validQuote, status: "draft" });

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "quote-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/Godkänn offerten/);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when an audit link already exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue(validQuote);
    auditFindFirstMock.mockResolvedValue({ metadata: { workOrderId: "wo-existing" } });

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "quote-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.workOrderId).toBe("wo-existing");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("creates a work order from an approved quote and writes the quote link as audit metadata", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue(validQuote);
    vendorFindFirstMock.mockResolvedValue({ id: "vendor-1", email: "kontakt@stad.se" });
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "quote-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        property_id: "property-1",
        estimated_cost: 12000,
        vendor_contract_id: "vendor-1",
      }),
    });
    expect(body).toEqual(expect.objectContaining({ success: true, workOrderId: "work-order-new", workOrderNumber: "AO-0012" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "quote",
        entityId: "quote-1",
        action: "quote.work_order_created",
        metadata: expect.objectContaining({ workOrderId: "work-order-new", vendorContractId: "vendor-1", source: "supplier" }),
      }),
      tx,
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({
        workOrderId: "work-order-new",
        workOrderNumber: "AO-0012",
        propertyName: "Storgatan 1",
        vendorContractId: "vendor-1",
        vendorEmail: "kontakt@stad.se",
      }),
    );
  });

  it("omits vendor_contract_id when the column is not released", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    quoteFindFirstMock.mockResolvedValue(validQuote);
    hasVendorColumnMock.mockResolvedValue(false);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", { method: "POST" }), {
      params: Promise.resolve({ id: "quote-1" }),
    });

    expect(response.status).toBe(201);
    expect(vendorFindFirstMock).not.toHaveBeenCalled();
    expect(workOrderCreateMock.mock.calls[0][0].data.vendor_contract_id).toBeUndefined();
  });

  it("denies a technician from creating a work order from a quote", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(new Request("http://localhost/api/quotes/quote-1/work-order", { method: "POST" }), {
      params: Promise.resolve({ id: "quote-1" }),
    });

    expect(response.status).toBe(403);
    expect(quoteFindFirstMock).not.toHaveBeenCalled();
  });
});
