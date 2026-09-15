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
    expect(source).toContain("`/dashboard/hyresavisering?id=${n.id}`");
    expect(source).toContain("upcoming.map(n=><Link key={n.id} href={`/dashboard/hyresavisering?id=${n.id}`}");
    expect(source).toContain("recent.map(n=><tr key={n.id}");
    expect(source).toContain("<Link href={`/dashboard/hyresavisering?id=${n.id}`} aria-label={`Öppna avie för ${n.tenant_name||\"motpart\"}`}");
    expect(source).not.toContain('role="link"');
    expect(source).not.toContain("router.push(`/dashboard/hyresavisering?id=${n.id}`)");
    expect(source).toContain("Ändra aviestatus i kön ovan");
  });
});
