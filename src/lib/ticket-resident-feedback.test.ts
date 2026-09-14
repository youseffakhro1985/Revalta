import { describe, expect, it, vi } from "vitest";
import {
  loadTicketResidentFeedback,
  parseResidentFeedbackMetadata,
  TICKET_RESIDENT_FEEDBACK_ACTION,
} from "./ticket-resident-feedback";

describe("ticket-resident-feedback", () => {
  it("accepts ratings 1-5 and trims comments", () => {
    expect(parseResidentFeedbackMetadata({ rating: 4, comment: "  Bra jobbat  " }, "2026-09-14T12:00:00.000Z")).toEqual({
      rating: 4,
      comment: "Bra jobbat",
      submittedAt: "2026-09-14T12:00:00.000Z",
    });
    expect(parseResidentFeedbackMetadata({ rating: 0 }, new Date("2026-09-14T12:00:00.000Z"))).toBeNull();
    expect(parseResidentFeedbackMetadata({ rating: 3.5 }, new Date())).toBeNull();
    expect(parseResidentFeedbackMetadata(null, new Date())).toBeNull();
  });

  it("loads the latest resident feedback audit for the ticket", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      metadata: { rating: 5, comment: "Tack" },
      created_at: new Date("2026-09-14T10:00:00.000Z"),
    });

    const feedback = await loadTicketResidentFeedback(
      { auditLog: { findFirst } },
      { companyId: "company-1", ticketId: "ticket-1" },
    );

    expect(feedback).toEqual({
      rating: 5,
      comment: "Tack",
      submittedAt: "2026-09-14T10:00:00.000Z",
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        company_id: "company-1",
        entity_type: "ticket",
        entity_id: "ticket-1",
        action: TICKET_RESIDENT_FEEDBACK_ACTION,
      },
    }));
  });
});
