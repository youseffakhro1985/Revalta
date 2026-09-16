import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("escalation admin actions first HTML", () => {
  it("keeps the run-engine action in the first HTML without autoFocus stealing Hantera regler", () => {
    const source = readFileSync(new URL("./escalation-admin-actions.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kor-eskalering"');
    expect(source).toContain('id="kor-eskalering-motor"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("Kör eskaleringsmotorn nu");
    expect(source).not.toContain("autoFocus");
  });
});
