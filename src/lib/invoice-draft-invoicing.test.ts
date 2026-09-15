import { describe, expect, it } from "vitest";
import {
  allowedStatusesForWorkOrderQuickActions,
  invoiceDraftAllowsWorkOrderInvoicing,
} from "./invoice-draft-invoicing";

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

  it("hides invoiced on completed work orders until the underlag is ready", () => {
    expect(allowedStatusesForWorkOrderQuickActions("completed", false)).toEqual([
      "completed",
      "in_progress",
    ]);
    expect(allowedStatusesForWorkOrderQuickActions("completed", true)).toEqual([
      "completed",
      "in_progress",
      "invoiced",
    ]);
    expect(allowedStatusesForWorkOrderQuickActions("in_progress", false)).toContain("completed");
    expect(allowedStatusesForWorkOrderQuickActions("in_progress", false)).not.toContain("invoiced");
  });
});
