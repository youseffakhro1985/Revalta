import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  storeAttachmentMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/storage", () => ({
  StorageConfigurationError: class StorageConfigurationError extends Error {},
  storeAttachment: storeAttachmentMock,
  deleteStoredFile: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ recordStorageEvent: vi.fn() }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { POST } from "./route";

const TENANT_A = "company-a";
const TICKET_B = "ticket-tenant-b";

function request() {
  const formData = new FormData();
  formData.set("file", new File([Buffer.from("png-data")], "photo.png", { type: "image/png" }));
  return new Request(`https://www.revalta.se/api/tickets/${TICKET_B}/attachments`, {
    method: "POST",
    body: formData,
  });
}

describe("staff ticket attachments tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindFirstMock.mockResolvedValue(null);
  });

  it("returns 403 and does not read tickets when a resident uses the staff attachment API", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-a",
      company_id: TENANT_A,
      role: "resident",
      email: "boende-a@exempel.se",
    });

    const response = await POST(request(), { params: Promise.resolve({ id: TICKET_B }) });

    expect(response.status).toBe(403);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(storeAttachmentMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 before blob upload when Tenant A posts to a Tenant B ticket id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-a",
      company_id: TENANT_A,
      role: "manager",
      email: "chef@exempel.se",
    });

    const response = await POST(request(), { params: Promise.resolve({ id: TICKET_B }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: TICKET_B,
        company_id: TENANT_A,
        deleted_at: null,
      }),
    }));
    expect(storeAttachmentMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
