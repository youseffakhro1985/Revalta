import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueTicketNotificationMock, queueSmsNotificationMock } = vi.hoisted(() => ({
  queueTicketNotificationMock: vi.fn(),
  queueSmsNotificationMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
  queueSmsNotification: queueSmsNotificationMock,
}));

import {
  notifyTicketReporter,
  reporterCommentEmailCopy,
  reporterStatusEmailCopy,
  reporterStatusSmsCopy,
} from "./ticket-reporter-notify";

const ticket = {
  id: "ticket-1",
  title: "Läckande kran",
  status: "in_progress",
  public_reference: "RV-12",
  reporter_email: "anna@example.se",
  reporter_phone: "0701234567",
};

describe("ticket-reporter-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueTicketNotificationMock.mockResolvedValue(undefined);
    queueSmsNotificationMock.mockResolvedValue(undefined);
  });

  it("writes Swedish status copy with the public reference", () => {
    expect(reporterStatusEmailCopy(ticket).subject).toBe("Ärende Pågår: Läckande kran");
    expect(reporterStatusSmsCopy(ticket)).toBe("Revalta: ärendet (RV-12) är nu Pågår.");
    expect(reporterCommentEmailCopy(ticket).subject).toBe("Ny kommentar på ärendet (RV-12): Läckande kran");
    expect(reporterStatusEmailCopy({ ...ticket, status: "closed" }).text).toContain("Om felet inte är åtgärdat");
  });

  it("emails and texts the reporter on status updates", async () => {
    const result = await notifyTicketReporter({ company_id: "company-1" }, ticket, "updated");
    expect(result).toEqual({ emailed: true, sms: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({ recipient: "anna@example.se", event: "updated", ticketId: "ticket-1" }),
    );
    expect(queueSmsNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({ recipient: "0701234567", ticketId: "ticket-1" }),
    );
  });

  it("emails comments without SMS", async () => {
    const result = await notifyTicketReporter({ company_id: "company-1" }, ticket, "commented");
    expect(result).toEqual({ emailed: true, sms: false });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({ recipient: "anna@example.se", event: "commented", ticketId: "ticket-1" }),
    );
    expect(queueSmsNotificationMock).not.toHaveBeenCalled();
  });

  it("skips SMS on comments and skips empty contacts", async () => {
    const result = await notifyTicketReporter(
      { company_id: "company-1" },
      { ...ticket, reporter_email: " ", reporter_phone: "" },
      "commented",
    );
    expect(result).toEqual({ emailed: false, sms: false });
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
    expect(queueSmsNotificationMock).not.toHaveBeenCalled();
  });
});
