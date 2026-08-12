import { beforeEach, describe, expect, it, vi } from "vitest";

const { attachmentFindFirstMock, getCurrentUserMock } = vi.hoisted(() => ({
  attachmentFindFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { ticketAttachment: { findFirst: attachmentFindFirstMock } },
}));
vi.mock("@/lib/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/current-user")>("@/lib/current-user");
  return { ...actual, getCurrentUser: getCurrentUserMock };
});

import { GET } from "./route";

function context() {
  return { params: Promise.resolve({ id: "attachment-1" }) };
}

describe("GET /api/attachments/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides an attachment on work not assigned to a technician", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "technician-1",
      role: "technician",
      company_id: "company-1",
    });
    attachmentFindFirstMock.mockResolvedValue({
      file_name: "rapport.pdf",
      content_type: "application/pdf",
      data_url: "data:application/pdf;base64,JVBERi0=",
      ticket: { assigned_to_id: "technician-2" },
    });

    const response = await GET(new Request("https://www.revalta.se/api/attachments/attachment-1"), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bilagan hittades inte" });
  });

  it("requires an active tenant-scoped parent ticket", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      role: "manager",
      company_id: "company-1",
    });
    attachmentFindFirstMock.mockResolvedValue(null);

    await GET(new Request("https://www.revalta.se/api/attachments/attachment-1"), context());

    expect(attachmentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attachment-1",
        ticket: expect.objectContaining({ company_id: "company-1", deleted_at: null }),
      }),
    }));
  });
});
