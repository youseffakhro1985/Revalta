import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component activity first HTML", () => {
  it("keeps the leftover event form in the first HTML and focuses the type after load", () => {
    const source = readFileSync(new URL("./component-activity-forms.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="komponent-aktivitet"');
    expect(source).toContain('id="komponent-handelse-typ"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#komponent-aktivitet"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("komponent-handelse-typ")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={saving}");
    expect(source).toContain('method="post"');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not steal Spara komponent or add a boendeportal sticky", () => {
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    const source = readFileSync(new URL("./component-activity-forms.tsx", import.meta.url), "utf8");
    expect(sticky).toContain("#spara-komponent");
    expect(sticky).not.toContain("#komponent-aktivitet");
    expect(sticky).not.toContain("#komponent-handelse-typ");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(source).toContain("Laddar…");
  });
});
