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
    expect(source).toContain("initialCommented");
    expect(source).toContain("initialAttached");
    expect(source).toContain("initialFeedback");
    expect(source).toContain("feedbackTicketCopy");
    expect(source).toContain("initialCatalog");
    expect(source).toContain("if (initialCatalog) return");
    expect(source).toContain('id="public-attachment-form"');
    expect(source).toContain('name="file"');
    expect(source).toContain('name="native"');
    expect(source).toContain("attachedTicketCopy");
    expect(source).toContain('encType="multipart/form-data"');
    expect(source).toContain('id="public-comment-form"');
    expect(source).toContain('name="body"');
    expect(source).toContain("commentedTicketCopy");
    expect(source).toContain('id="public-feedback-form"');
    expect(source).toContain('name="rating"');
    expect(source).toContain('name="comment"');
    expect(source).toContain('type="radio"');
    expect(source).toContain("required");
    expect(source).not.toContain("disabled={loading || feedbackRating < 1}");
    expect(source).not.toContain("disabled={loading || !residentComment.trim()}");
    expect(source).not.toContain("disabled={loading || !attachmentFile}");
    expect(source).not.toContain("searchParams.set(\"email\"");
  });
});

describe("public portal feedback post-load", () => {
  it("keeps closed-ticket feedback in the first HTML and focuses the comment after load", () => {
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="boende-aterkoppling"');
    expect(source).toContain('id="boende-aterkoppling-kommentar"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#boende-aterkoppling"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("boende-aterkoppling-kommentar")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain('id="public-ticket-form"');
    expect(source).toContain('id="public-feedback-form"');
  });

  it("does not add a boendeportal page sticky or steal the public create form", () => {
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-aterkoppling");
    expect(sticky).not.toContain("#boende-aterkoppling-kommentar");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="public-ticket-form" autoFocus');
  });
});

describe("public portal create post-load", () => {
  it("keeps the public create form in the first HTML and focuses the name after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="public-ticket-form"');
    expect(source).toContain('id="portal-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#public-ticket-form"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("portal-namn")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain('id="boende-aterkoppling"');
    expect(source).toContain('id="boende-aterkoppling-kommentar"');
    expect(source).toContain('document.getElementById("boende-aterkoppling-kommentar")?.focus()');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a boendeportal page sticky or steal feedback autoFocus", () => {
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#public-ticket-form");
    expect(sticky).not.toContain("#portal-namn");
    expect(sticky).not.toContain("#boende-aterkoppling");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('id="portal-namn" autoFocus');
  });
});

describe("public portal track leftover first HTML", () => {
  it("keeps the track form in the first HTML and focuses the reference after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="public-track-form"');
    expect(source).toContain('id="portal-ref"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#public-track-form"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("portal-ref")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain('id="portal-namn"');
    expect(source).toContain('document.getElementById("portal-namn")?.focus()');
    expect(source).toContain('id="boende-aterkoppling-kommentar"');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a boendeportal page sticky or steal create or feedback", () => {
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    const source = readFileSync(new URL("./public-portal-client.tsx", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#public-track-form");
    expect(sticky).not.toContain("#portal-ref");
    expect(sticky).not.toContain("#portal-namn");
    expect(sticky).not.toContain("#boende-aterkoppling");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('id="portal-ref" autoFocus');
  });
});
