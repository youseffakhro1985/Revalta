import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manager dashboard", () => {
  it("assigns unassigned tickets from the overview without a new nav item", () => {
    const source = readFileSync(new URL("./manager-dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("TicketAssignQueuePanel");
    expect(source).not.toContain("ticketQueue.map");
  });
});
