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

describe("demo request first HTML focus", () => {
  it("keeps the demo form in the first HTML and focuses the name after load", () => {
    const source = readFileSync(new URL("./demo-request-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="demo-request-form"');
    expect(source).toContain('id="demo-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#demo-request-form"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("demo-namn")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={submitting}");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a dashboard sticky for the public demo form", () => {
    const sticky = readFileSync(new URL("./dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("#demo-request-form");
    expect(sticky).not.toContain("#demo-namn");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
