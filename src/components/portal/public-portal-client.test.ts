import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public portal ticket form", () => {
  it("submits named reporter fields from the form DOM", () => {
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="public-ticket-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action={withCompanySlug("/api/public/tickets", companySlug)}');
    expect(source).toContain('name="reporterName"');
    expect(source).toContain('name="reporterEmail"');
    expect(source).toContain('name="reporterPhone"');
    expect(source).toContain('name="reporterUnit"');
    expect(source).toContain('name="propertyId"');
    expect(source).toContain('name="title"');
    expect(source).toContain('name="description"');
    expect(source).toContain('name="companySlug"');
    expect(source).toContain("initialCreated");
    expect(source).toContain("portalReasonCopy");
    expect(source).toContain("createdTicketCopy");
    expect(source).toContain('get("created")');
    expect(source).toContain('get("reason")');
    expect(source).toContain("Kontrollera namn, e-post, fastighet, rubrik och beskrivning.");
    expect(source).toContain("Boendeportalen är inte tillgänglig just nu.");
    expect(source).toContain('id="public-track-form"');
    expect(source).toContain('method="get"');
    expect(source).toContain('name="ref"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="token"');
    expect(source).toContain("initialTrackedTicket");
    expect(source).not.toContain("searchParams.set(\"email\"");
  });
});
