import { describe, expect, it } from "vitest";
import {
  canCommentOnResidentPortalTicket,
  mapResidentPortalComments,
} from "@/lib/resident-portal-tickets";

describe("resident-portal-tickets helpers", () => {
  it("allows residents and ticket managers to comment", () => {
    expect(canCommentOnResidentPortalTicket("resident")).toBe(true);
    expect(canCommentOnResidentPortalTicket("manager")).toBe(true);
    expect(canCommentOnResidentPortalTicket("technician")).toBe(true);
    expect(canCommentOnResidentPortalTicket("viewer")).toBe(false);
  });

  it("maps resident and staff comments for the portal view", () => {
    const comments = mapResidentPortalComments(
      [
        {
          id: "1",
          body: "Hej från mig",
          created_at: new Date("2026-07-01T10:00:00.000Z"),
          author_type: "resident",
          author_name: null,
          user: { name: "Owner" },
        },
        {
          id: "2",
          body: "Vi åtgärdar",
          created_at: new Date("2026-07-01T11:00:00.000Z"),
          author_type: "staff",
          author_name: null,
          user: { name: "Anna" },
        },
      ],
      "Boende Namn",
    );

    expect(comments).toEqual([
      {
        id: "1",
        body: "Hej från mig",
        created_at: new Date("2026-07-01T10:00:00.000Z"),
        author: { type: "resident", name: "Boende Namn" },
      },
      {
        id: "2",
        body: "Vi åtgärdar",
        created_at: new Date("2026-07-01T11:00:00.000Z"),
        author: { type: "management", name: "Anna" },
      },
    ]);
  });
});
