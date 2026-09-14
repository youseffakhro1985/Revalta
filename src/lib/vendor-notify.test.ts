import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queueTicketNotificationMock } = vi.hoisted(() => ({
  queueTicketNotificationMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

import { notifyVendor, vendorAssignedEmailCopy, vendorCancelledEmailCopy, vendorCompletedEmailCopy, vendorPausedEmailCopy, vendorResumedEmailCopy } from "./vendor-notify";

describe("vendor-notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueTicketNotificationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the work order and property without staff login links or amounts", () => {
    const copy = vendorAssignedEmailCopy({
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
    });
    expect(copy.subject).toBe("Ny arbetsorder AO-0012: Filterbyte");
    expect(copy.text).toContain("Arbetsorder: AO-0012");
    expect(copy.text).toContain("Fastighet: Storgatan 12");
    expect(copy.text).toContain("Uppdrag: Filterbyte");
    expect(copy.text).toContain("ingen inloggning");
    expect(copy.text).not.toContain("/dashboard");
    expect(copy.text).not.toContain("token=");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
    expect(copy.text).not.toContain("subtotal");
  });

  it("names a completed work order without staff login links or amounts", () => {
    const copy = vendorCompletedEmailCopy({
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
      kind: "completed",
    });
    expect(copy.subject).toBe("Arbetsorder klar AO-0012: Filterbyte");
    expect(copy.text).toContain("slutförd");
    expect(copy.text).toContain("Arbetsorder: AO-0012");
    expect(copy.text).not.toContain("/dashboard");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
  });

  it("names a paused work order without staff login links, amounts or free-text reasons", () => {
    const copy = vendorPausedEmailCopy({
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
      kind: "paused",
      pauseLabel: "Väntar material",
    });
    expect(copy.subject).toBe("Arbetsorder pausad AO-0012: Filterbyte");
    expect(copy.text).toContain("Väntar material");
    expect(copy.text).not.toContain("/dashboard");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
    expect(copy.text).not.toContain("statusReason");
  });

  it("names a cancelled work order without staff login links, amounts or free-text reasons", () => {
    const copy = vendorCancelledEmailCopy({
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
      kind: "cancelled",
    });
    expect(copy.subject).toBe("Arbetsorder avbruten AO-0012: Filterbyte");
    expect(copy.text).toContain("avbruten");
    expect(copy.text).toContain("Utför inget mer arbete");
    expect(copy.text).not.toContain("/dashboard");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
    expect(copy.text).not.toContain("statusReason");
  });

  it("names a resumed work order with a status label and no staff login", () => {
    const copy = vendorResumedEmailCopy({
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
      kind: "resumed",
      resumeLabel: "Påbörjad",
    });
    expect(copy.subject).toBe("Arbetsorder återupptagen AO-0012: Filterbyte");
    expect(copy.text).toContain("Påbörjad");
    expect(copy.text).not.toContain("/dashboard");
    expect(copy.text).not.toMatch(/\d+\s*kr/i);
  });

  it("emails a vendor contact and skips missing or invalid addresses", async () => {
    const actor = { id: "manager-1", company_id: "company-1" };
    const target = {
      workOrderId: "wo-1",
      title: "Filterbyte",
      workOrderNumber: "AO-0012",
      propertyName: "Storgatan 12",
      vendorContractId: "vendor-1",
      vendorEmail: "kontakt@stad.se",
    };

    await expect(notifyVendor(actor, target)).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        ticketId: "wo-1",
        recipient: "kontakt@stad.se",
        event: "updated",
        emailContent: expect.objectContaining({
          subject: "Ny arbetsorder AO-0012: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyVendor(actor, { ...target, kind: "completed" })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Arbetsorder klar AO-0012: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyVendor(actor, {
      ...target,
      kind: "paused",
      pauseLabel: "Blockerad",
    })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Arbetsorder pausad AO-0012: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyVendor(actor, { ...target, kind: "cancelled" })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Arbetsorder avbruten AO-0012: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyVendor(actor, {
      ...target,
      kind: "resumed",
      resumeLabel: "Påbörjad",
    })).resolves.toEqual({ emailed: true });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        emailContent: expect.objectContaining({
          subject: "Arbetsorder återupptagen AO-0012: Filterbyte",
        }),
      }),
    );

    queueTicketNotificationMock.mockClear();
    await expect(notifyVendor(actor, { ...target, vendorEmail: "inte-en-adress" })).resolves.toEqual({ emailed: false });
    await expect(notifyVendor(actor, { ...target, vendorEmail: "" })).resolves.toEqual({ emailed: false });
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });
});
