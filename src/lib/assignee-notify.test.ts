import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queueTicketNotificationMock } = vi.hoisted(() => ({
  queueTicketNotificationMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

import {
  assigneeAssignedEmailCopy,
  assigneeCancelledEmailCopy,
  assigneeCompletedEmailCopy,
  assigneePausedEmailCopy,
  assigneeResumedEmailCopy,
  notifyAssignee,
} from "./assignee-notify";

describe("assignee-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se");
    queueTicketNotificationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes a staff deep link without reporter tokens", () => {
    const copy = assigneeAssignedEmailCopy({
      id: "ticket-1",
      title: "Läckande kran",
      kind: "ticket",
      assigneeId: "tech-1",
      assigneeEmail: "tech@example.se",
    });
    expect(copy.subject).toBe("Tilldelad: Läckande kran");
    expect(copy.text).toContain("https://www.revalta.se/dashboard/felanmalan/ticket-1");
    expect(copy.text).not.toContain("token=");
  });

  it("names a paused work order with a status label and staff deep link", () => {
    const copy = assigneePausedEmailCopy({
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      notifyKind: "paused",
      pauseLabel: "Väntar material",
    });
    expect(copy.subject).toBe("Pausad: Filterbyte");
    expect(copy.text).toContain("Väntar material");
    expect(copy.text).toContain("https://www.revalta.se/dashboard/arbetsorder/wo-1");
    expect(copy.text).not.toContain("token=");
    expect(copy.text).not.toContain("statusReason");
  });

  it("names a completed work order with a staff deep link and no amounts", () => {
    const copy = assigneeCompletedEmailCopy({
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      notifyKind: "completed",
    });
    expect(copy.subject).toBe("Slutförd: Filterbyte");
    expect(copy.text).toContain("slutförd");
    expect(copy.text).toContain("https://www.revalta.se/dashboard/arbetsorder/wo-1");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
  });

  it("names a cancelled work order with a staff deep link and no free-text reasons", () => {
    const copy = assigneeCancelledEmailCopy({
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      notifyKind: "cancelled",
    });
    expect(copy.subject).toBe("Avbruten: Filterbyte");
    expect(copy.text).toContain("avbruten");
    expect(copy.text).toContain("https://www.revalta.se/dashboard/arbetsorder/wo-1");
    expect(copy.text).not.toContain("statusReason");
  });

  it("names a resumed work order with a status label and staff deep link", () => {
    const copy = assigneeResumedEmailCopy({
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      notifyKind: "resumed",
      resumeLabel: "Påbörjad",
    });
    expect(copy.subject).toBe("Återupptagen: Filterbyte");
    expect(copy.text).toContain("Påbörjad");
    expect(copy.text).toContain("https://www.revalta.se/dashboard/arbetsorder/wo-1");
  });

  it("emails a new assignee and skips self-assignment", async () => {
    const actor = { id: "manager-1", company_id: "company-1" };
    await expect(notifyAssignee(actor, {
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      assigneeId: "tech-1",
      assigneeEmail: "tech@example.se",
    })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        recipient: "tech@example.se",
        event: "updated",
        emailContent: expect.objectContaining({
          text: expect.stringContaining("/dashboard/arbetsorder/wo-1"),
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyAssignee({ id: "tech-1", company_id: "company-1" }, {
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order",
      assigneeId: "tech-1",
      assigneeEmail: "tech@example.se",
    })).resolves.toEqual({ emailed: false });
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });

  it("emails pause and complete notices and still skips self-actions", async () => {
    const actor = { id: "manager-1", company_id: "company-1" };
    const target = {
      id: "wo-1",
      title: "Filterbyte",
      kind: "work_order" as const,
      assigneeId: "tech-1",
      assigneeEmail: "tech@example.se",
    };

    await expect(notifyAssignee(actor, {
      ...target,
      notifyKind: "paused",
      pauseLabel: "Blockerad",
    })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Pausad: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyAssignee(actor, { ...target, notifyKind: "completed" })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Slutförd: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyAssignee(actor, { ...target, notifyKind: "cancelled" })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Avbruten: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyAssignee(actor, {
      ...target,
      notifyKind: "resumed",
      resumeLabel: "Påbörjad",
    })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Återupptagen: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyAssignee({ id: "tech-1", company_id: "company-1" }, {
      ...target,
      notifyKind: "cancelled",
    })).resolves.toEqual({ emailed: false });
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });
});
