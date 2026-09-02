import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  getLatestInvoiceDraftMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canViewFinanceData: () => true,
}));

vi.mock("@/lib/db", () => ({
  default: { workOrder: { findFirst: workOrderFindFirstMock } },
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  getLatestInvoiceDraft: getLatestInvoiceDraftMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

function request(format?: string) {
  const suffix = format ? `?format=${encodeURIComponent(format)}` : "";
  return new Request(`https://www.revalta.se/api/work-orders/wo-1/invoice-basis/export${suffix}`);
}

const draft = {
  versionId: "invoice-v1",
  status: "ready",
  net: 100,
  vat: 25,
  total: 125,
  lines: [
    {
      type: "other",
      description: "Normal rad",
      quantity: 1,
      unit: "st",
      unitPrice: 100,
      total: 100,
    },
  ],
};

describe("work-order invoice file export hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
    });
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Arbetsorder",
      property: { name: "Storgatan 1", address: "Storgatan 1", postal_code: "41101", city: "Göteborg" },
      company: { name: "Revalta Test", org_number: "559999-9999" },
    });
    getLatestInvoiceDraftMock.mockResolvedValue(draft);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects unknown export formats without creating an audit action", async () => {
    const response = await GET(request("../../evil"), params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltigt exportformat");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("neutralizes spreadsheet formula prefixes in CSV cells", async () => {
    getLatestInvoiceDraftMock.mockResolvedValue({
      ...draft,
      lines: [{
        type: "other",
        description: "=HYPERLINK(\"https://example.test\",\"click\")",
        quantity: 1,
        unit: "st",
        unitPrice: 100,
        total: 100,
      }],
    });

    const response = await GET(request("csv"), params);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(body).toContain("\"'=HYPERLINK(\"\"https://example.test\"\",\"\"click\"\")\"");
    expect(body).not.toContain("\"=HYPERLINK");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({ action: "work_order.invoice_export_csv" }),
    );
  });

  it("marks JSON exports private and no-store", async () => {
    const response = await GET(request("json"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.providerHint).toBe("generic");
    expect(body.invoice.versionId).toBe("invoice-v1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_export_json" }),
    );
  });

  it.each(["fortnox", "visma"])("keeps %s export identities allowlisted", async (format) => {
    const response = await GET(request(format), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerHint).toBe(format);
    expect(response.headers.get("content-disposition")).toContain(`-${format}.json`);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: `work_order.invoice_export_${format}` }),
    );
  });
});
