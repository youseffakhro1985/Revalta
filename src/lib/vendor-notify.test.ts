import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queueTicketNotificationMock } = vi.hoisted(() => ({
  queueTicketNotificationMock: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

import { notifyVendor, vendorAssignedEmailCopy } from "./vendor-notify";

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
    await expect(notifyVendor(actor, { ...target, vendorEmail: "inte-en-adress" })).resolves.toEqual({ emailed: false });
    await expect(notifyVendor(actor, { ...target, vendorEmail: "" })).resolves.toEqual({ emailed: false });
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });
});
