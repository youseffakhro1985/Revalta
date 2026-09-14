import { describe, expect, it } from "vitest";
import { invoiceDraftAllowsWorkOrderInvoicing } from "./invoice-draft-invoicing";

describe("invoiceDraftAllowsWorkOrderInvoicing", () => {
  it("allows ready and exported drafts", () => {
    expect(invoiceDraftAllowsWorkOrderInvoicing({ status: "ready" })).toBe(true);
    expect(invoiceDraftAllowsWorkOrderInvoicing({ status: "exported" })).toBe(true);
  });

  it("rejects missing, draft and cancelled underlag", () => {
    expect(invoiceDraftAllowsWorkOrderInvoicing(null)).toBe(false);
    expect(invoiceDraftAllowsWorkOrderInvoicing(undefined)).toBe(false);
    expect(invoiceDraftAllowsWorkOrderInvoicing({ status: "draft" })).toBe(false);
    expect(invoiceDraftAllowsWorkOrderInvoicing({ status: "cancelled" })).toBe(false);
    expect(invoiceDraftAllowsWorkOrderInvoicing({ status: "  " })).toBe(false);
  });
});
