import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order quick actions", () => {
  it("acquires the edit lock before assigning or changing status from planning", () => {
    const source = readFileSync(new URL("./work-order-quick-actions.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/${workOrderId}/edit-lock");
    expect(source).toContain("/api/work-orders/${workOrderId}/locked-update");
    expect(source).toContain('action: "acquire"');
    expect(source).toContain('action: "release"');
    expect(source).toContain("editToken");
    expect(source).toContain("status === 423");
    expect(source).not.toContain("`/api/work-orders/${workOrderId}`");
  });

  it("asks the transitions API whether Fakturerad is allowed before offering it", () => {
    const source = readFileSync(new URL("./work-order-quick-actions.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/${workOrderId}/transitions");
    expect(source).toContain("allowedStatusesForWorkOrderQuickActions");
    expect(source).toContain("canMarkInvoiced");
    expect(source).toContain("invoiceBlockReason");
  });
});
