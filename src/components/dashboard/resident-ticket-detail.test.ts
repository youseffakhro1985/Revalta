import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("resident ticket detail native comments", () => {
  it("renders the ticket on the server and posts comments as a native form", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/arenden/[id]/page.tsx", import.meta.url), "utf8");
    const detail = readFileSync(new URL("./resident-ticket-detail.tsx", import.meta.url), "utf8");

    expect(page).toContain("findAccessibleResidentPortalTicket");
    expect(page).toContain("ResidentTicketDetailView");
    expect(page).not.toContain("\"use client\"");
    expect(detail).toContain('action={`/api/resident-portal/tickets/${ticketId}/comments`}');
    expect(detail).toContain('method="post"');
    expect(detail).toContain('name="body"');
    expect(detail).toContain("event.preventDefault()");
    expect(detail).not.toContain("disabled={saving || !commentBody.trim()}");
    expect(detail).toContain("disabled={saving}");
    expect(detail).toContain('id="boende-kommentar"');
    expect(detail).toContain('id="resident-ticket-comment"');
    expect(detail).toContain("autoFocus");
    expect(detail).toContain("scroll-mt-36");
    expect(detail).toContain("scrollIntoView");
    expect(detail).toContain('document.getElementById("resident-ticket-comment")?.focus()');
  });

  it("does not add a boendeportal page sticky", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-kommentar");
    expect(sticky).not.toContain("#resident-ticket-comment");
  });
});
