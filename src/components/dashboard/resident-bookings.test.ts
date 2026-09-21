import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("resident bookings native create and cancel", () => {
  it("renders bookings on the server and posts create and cancel as native forms", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/bokningar/page.tsx", import.meta.url), "utf8");
    const bookings = readFileSync(new URL("./resident-bookings.tsx", import.meta.url), "utf8");

    expect(page).toContain("loadResidentPortalBookings");
    expect(page).toContain("ResidentBookings");
    expect(page).not.toContain("\"use client\"");
    expect(bookings).toContain('action="/api/resident-portal/bookings"');
    expect(bookings).toContain('method="post"');
    expect(bookings).toContain('name="leaseId"');
    expect(bookings).toContain('name="resource"');
    expect(bookings).toContain('name="start"');
    expect(bookings).toContain('name="end"');
    expect(bookings).toContain('name="note"');
    expect(bookings).toContain('name="intent"');
    expect(bookings).toContain('value="cancel"');
    expect(bookings).toContain('name="bookingId"');
    expect(bookings).toContain("event.preventDefault()");
    expect(bookings).toContain('id="boende-bokning"');
    expect(bookings).toContain('id="boende-resurs"');
    expect(bookings).toContain("autoFocus");
    expect(bookings).toContain("scroll-mt-36");
    expect(bookings).toContain("scrollIntoView");
    expect(bookings).toContain('document.getElementById("boende-resurs")?.focus()');
    expect(bookings).toContain("disabled={saving || loading}");
  });

  it("does not add a boendeportal page sticky", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-bokning");
    expect(sticky).not.toContain("#boende-resurs");
  });
});
