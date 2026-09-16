import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order SLA detail panel", () => {
  it("sends the shared edit lock token and version with SLA PATCH", () => {
    const source = readFileSync(new URL("./work-order-sla-detail-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("useOptionalWorkOrderEditLock");
    expect(source).toContain("/api/work-orders/${workOrderId}/sla");
    expect(source).toContain("/api/work-orders/${workOrderId}/edit-lock");
    expect(source).toContain('action: "acquire"');
    expect(source).toContain('action: "release"');
    expect(source).toContain("editToken");
    expect(source).toContain("version");
    expect(source).toContain("sharedLock?.setVersion");
    expect(source).toContain("status === 423");
    expect(source).toContain("samma redigeringslås som arbetsordern");
  });

  it("keeps the SLA deadline form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-sla-detail-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-sla"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-sla"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || slaFormLocked");
    expect(source).toContain("canManage || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-56 animate-pulse rounded-2xl bg-sand-100\" aria-label=\"Laddar SLA-bedömning\" />");
  });
});
