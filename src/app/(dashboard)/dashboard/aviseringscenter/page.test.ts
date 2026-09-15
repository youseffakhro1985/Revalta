import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aviseringscenter SLA copy", () => {
  it("sends SLA assignment to Planering and Dagens förvaltning instead of inventing a third assign surface", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Öppna arbetsordern för att tilldela ansvarig");
    expect(source).toContain("Otilldelade arbetsordrar tilldelas i Planering eller Dagens förvaltning.");
    expect(source).toContain('href="/dashboard/arbetsorder/planering"');
    expect(source).toContain('href="/dashboard"');
    expect(source).toContain("Tilldela i Planering");
    expect(source).toContain("Dagens förvaltning");
    expect(source).not.toContain("/api/work-orders/unassigned-queue");
  });
});
