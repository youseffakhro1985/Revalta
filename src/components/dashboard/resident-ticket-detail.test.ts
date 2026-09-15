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
  });
});
