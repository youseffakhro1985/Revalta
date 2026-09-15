import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("offerter create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./offerter-page.tsx", import.meta.url), "utf8");

  it("opens the create form from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain('params.create === "1"');
    expect(page).toContain("initialCreate");
  });

  it("keeps the sticky-header create contract and native close", () => {
    expect(form).toContain("useState(initialCreate)");
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("closeCreate");
    expect(form).toContain("router.replace");
    expect(form).toContain("Ny offert");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).not.toContain("＋");
  });
});

describe("offerter work-order action", () => {
  it("creates an arbetsorder from an approved quote via the dedicated API", () => {
    const source = readFileSync(new URL("./offerter-page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).toContain("/api/quotes/${quote.id}/work-order");
    expect(source).toContain("Öppna arbetsorder");
  });

  it("marks draft quotes as sent without offering decision statuses on create", () => {
    const source = readFileSync(new URL("./offerter-page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Markera som skickad");
    expect(source).toContain("updateStatus(quote, \"sent\")");
    expect(source).toContain("Object.entries(initialStatusLabels)");
    expect(source).toContain("Revalta skickar inget mejl");
    expect(source).toContain('aria-label="Status">{Object.entries(initialStatusLabels)');
    expect(source).not.toContain('aria-label="Status">{Object.entries(labels)');
  });
});
