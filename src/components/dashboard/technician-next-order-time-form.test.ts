import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician next-order time form", () => {
  it("posts a time execution entry on the existing work-order route", () => {
    const source = readFileSync(new URL("./technician-next-order-time-form.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/${workOrderId}/execution");
    expect(source).toContain('action: "entry.create"');
    expect(source).toContain('entryType: "time"');
    expect(source).toContain("router.refresh()");
    expect(source).not.toContain("completion.finalize");
    expect(source).not.toContain("Slutför");
  });
});

describe("technician next-order time first HTML", () => {
  it("keeps the time form in the first HTML and scrolls to the sticky hash", () => {
    const source = readFileSync(new URL("./technician-next-order-time-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="registrera-tid"');
    expect(source).toContain('id="tid-beskrivning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#registrera-tid"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("tid-beskrivning")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={saving}");
    expect(source).not.toContain("if (loading) return");
  });
});
