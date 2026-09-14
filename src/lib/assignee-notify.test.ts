import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queueTicketNotificationMock } = vi.hoisted(() => ({
  queueTicketNotificationMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

import { assigneeAssignedEmailCopy, notifyAssignee } from "./assignee-notify";

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
});
