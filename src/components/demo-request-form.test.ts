import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo request form", () => {
  it("länkar integritetspolicyn från samtyckestexten", () => {
    const source = readFileSync(new URL("./demo-request-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('href="/juridik/integritet"');
    expect(source).toContain("Revaltas integritetspolicy");
  });

  it("submits named fields from the form DOM", () => {
    const source = readFileSync(new URL("./demo-request-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="demo-request-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/demo-request"');
    expect(source).toContain('name="name"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="company"');
    expect(source).toContain('name="phone"');
    expect(source).toContain('name="role"');
    expect(source).toContain('name="portfolio"');
    expect(source).toContain('name="message"');
    expect(source).toContain('name="website"');
    expect(source).toContain("initialSent");
    expect(source).toContain('get("sent")');
    expect(source).toContain('get("reason")');
    expect(source).toContain("Fyll i namn, giltig e-post och företag");
  });
});
