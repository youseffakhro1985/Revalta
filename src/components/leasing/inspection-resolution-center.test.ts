import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inspection resolution center first HTML", () => {
  it("keeps the reconcile action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./inspection-resolution-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="synkronisera-besiktning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#synkronisera-besiktning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={formLocked}");
    expect(source).toContain("Synkronisera slutförda arbetsorder");
    expect(source).not.toContain('<div className="h-28 animate-pulse rounded-xl bg-sand-100" />');
  });
});
