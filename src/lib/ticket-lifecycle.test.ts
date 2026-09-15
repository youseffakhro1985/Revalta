import { describe, expect, it } from "vitest";
import {
  allowedTicketTransitions,
  canTransitionTicket,
  deriveTicketStatus,
  isTicketStatus,
  normalizeTicketStatus,
  ticketStatusFilterValues,
  ticketStatusRequiresAssignee,
} from "./ticket-lifecycle";

describe("ticket lifecycle", () => {
  it("accepts ticket domain statuses and rejects work-order leftovers as canonical values", () => {
    expect(isTicketStatus("received")).toBe(true);
    expect(isTicketStatus("assigned")).toBe(false);
    expect(isTicketStatus("planned")).toBe(false);
    expect(isTicketStatus("cancelled")).toBe(false);
  });

  it("maps leftover work-order values onto the ticket domain", () => {
    expect(normalizeTicketStatus("received")).toBe("received");
    expect(normalizeTicketStatus("assigned")).toBe("received");
    expect(normalizeTicketStatus("planned")).toBe("received");
    expect(normalizeTicketStatus("waiting_material")).toBe("waiting");
    expect(normalizeTicketStatus("blocked")).toBe("waiting");
    expect(normalizeTicketStatus("inspection")).toBe("in_progress");
    expect(normalizeTicketStatus("cancelled")).toBe("closed");
    expect(normalizeTicketStatus("mystery")).toBe("new");
  });

  it("derives received when a new ticket is assigned", () => {
    expect(deriveTicketStatus({ current: "new", assignedToId: "user-1" })).toBe("received");
    expect(deriveTicketStatus({ current: "new", assignedToId: null })).toBe("new");
    expect(deriveTicketStatus({ current: "in_progress", assignedToId: "user-1" })).toBe("in_progress");
    expect(deriveTicketStatus({ current: "new", requested: "closed" })).toBe("closed");
  });

  it("allows ticket-domain transitions and requires an assignee only for in progress", () => {
    expect(allowedTicketTransitions("new")).toEqual(["received", "in_progress", "closed"]);
    expect(canTransitionTicket("new", "received")).toBe(true);
    expect(canTransitionTicket("closed", "planned" as never)).toBe(false);
    expect(ticketStatusRequiresAssignee("in_progress")).toBe(true);
    expect(ticketStatusRequiresAssignee("received")).toBe(false);
  });

  it("expands list filters so leftover work-order values still match", () => {
    expect(ticketStatusFilterValues("received")).toEqual(["received", "assigned", "planned"]);
    expect(ticketStatusFilterValues("assigned")).toEqual(["received", "assigned", "planned"]);
    expect(ticketStatusFilterValues("waiting")).toEqual(["waiting", "waiting_material", "blocked"]);
    expect(ticketStatusFilterValues("new")).toEqual(["new"]);
    expect(ticketStatusFilterValues("not-a-status")).toEqual(["not-a-status"]);
  });
});
