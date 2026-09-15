import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ekonomi overview", () => {
  it("surfaces the attestation queue without a new nav item", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("AttestationQueuePanel");
    expect(source).toContain("InvoiceBasisQueuePanel");
    expect(source).toContain("InvoiceExportQueuePanel");
    expect(source).toContain("InvoiceCloseQueuePanel");
    expect(source).toContain("RentNoticeStatusQueuePanel");
  });
});
