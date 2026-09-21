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

  it("looks up Tenant B attachment ids only inside Tenant A company_id and 404s without streaming blob", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-a",
      role: "manager",
      company_id: "company-a",
    });
    attachmentFindFirstMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://www.revalta.se/api/attachments/attachment-tenant-b"),
      { params: Promise.resolve({ id: "attachment-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Bilagan hittades inte");
    expect(attachmentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attachment-tenant-b",
        ticket: expect.objectContaining({ company_id: "company-a", deleted_at: null }),
      }),
    }));
  });
});
