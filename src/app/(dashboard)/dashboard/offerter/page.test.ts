import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("offerter work-order action", () => {
  it("creates an arbetsorder from an approved quote via the dedicated API", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).toContain("/api/quotes/${quote.id}/work-order");
    expect(source).toContain("Öppna arbetsorder");
  });

  it("marks draft quotes as sent without offering decision statuses on create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Markera som skickad");
    expect(source).toContain("updateStatus(quote, \"sent\")");
    expect(source).toContain("Object.entries(initialStatusLabels)");
    expect(source).toContain("Revalta skickar inget mejl");
    expect(source).toContain('aria-label="Status">{Object.entries(initialStatusLabels)');
    expect(source).not.toContain('aria-label="Status">{Object.entries(labels)');
  });
});
