import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ticket SLA presentation", () => {
  it("renders due date and SLA policy label on the ticket detail page", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("getSlaLabel");
    expect(source).toContain("ticket.due_date");
    expect(source).toContain("SLA");
  });
});

describe("ticket detail save hash", () => {
  it("keeps the steering form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-arende"');
    expect(source).toContain('id="arende-status"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-arende"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("arende-status")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !ticket");
    expect(source).toContain("formLocked || !permissions.canManage");
    expect(source).not.toContain("if (loading) return <div className=\"h-72 animate-pulse rounded-3xl bg-sand-100\" />");
  });
});

describe("ticket leftover details first HTML", () => {
  it("keeps leftover details in the first HTML without stealing save", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arendedetaljer"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#arendedetaljer"');
    expect(source).toContain('id="spara-arende"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Ärendedetaljerna hämtas.");
    expect(source).not.toContain("h-72 animate-pulse rounded-3xl bg-sand-100");
  });
});
