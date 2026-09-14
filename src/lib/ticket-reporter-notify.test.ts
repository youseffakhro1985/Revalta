import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  reporterCreatedEmailCopy,
  reporterCreatedSmsCopy,
  reporterStaffCreatedEmailCopy,
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
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-with-at-least-32-chars");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se");
    queueTicketNotificationMock.mockResolvedValue(undefined);
    queueSmsNotificationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes Swedish status copy with a trackable portal URL", () => {
    const trackUrl = "https://www.revalta.se/portal?ref=RV-12&token=abc";
    expect(reporterStatusEmailCopy(ticket, trackUrl).subject).toBe("Ärende Pågår: Läckande kran");
    expect(reporterStatusEmailCopy(ticket, trackUrl).text).toContain(trackUrl);
    expect(reporterStatusSmsCopy(ticket, "https://www.revalta.se/portal?ref=RV-12")).toBe(
      "Revalta: ärendet (RV-12) är nu Pågår. Följ på https://www.revalta.se/portal?ref=RV-12.",
    );
    expect(reporterCommentEmailCopy(ticket, trackUrl).subject).toBe("Ny kommentar på ärendet (RV-12): Läckande kran");
    expect(reporterStatusEmailCopy({ ...ticket, status: "closed" }, `${trackUrl}&feedback=1`).text).toContain("Berätta gärna hur det gick");
    expect(reporterCreatedEmailCopy(ticket, trackUrl).subject).toBe("Ärende mottaget (RV-12): Läckande kran");
    expect(reporterCreatedSmsCopy("RV-12")).toBe("Tack! Ärende RV-12 är mottaget. Följ på https://www.revalta.se/portal med referensen.");
    expect(reporterStaffCreatedEmailCopy(ticket).subject).toBe("Ny felanmälan (RV-12): Läckande kran");
    expect(reporterStaffCreatedEmailCopy(ticket).text).not.toContain("token=");
  });

  it("emails and texts the reporter on status updates without putting the token in SMS", async () => {
    const result = await notifyTicketReporter({ company_id: "company-1" }, ticket, "updated");
    expect(result).toEqual({ emailed: true, sms: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({
        recipient: "anna@example.se",
        event: "updated",
        ticketId: "ticket-1",
        emailContent: expect.objectContaining({
          text: expect.stringContaining("https://www.revalta.se/portal?ref=RV-12&token="),
        }),
      }),
    );
    const smsMessage = queueSmsNotificationMock.mock.calls[0][1].message as string;
    expect(smsMessage).toContain("https://www.revalta.se/portal?ref=RV-12");
    expect(smsMessage).not.toContain("token=");
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
