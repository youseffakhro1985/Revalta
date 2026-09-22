import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, queryRawMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: { $queryRaw: queryRawMock },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ id: "template-1" });

describe("round-checklists/[id] staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
  });

  it("PATCH rejects residents before updating a template", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await PATCH(new Request("http://localhost/api/round-checklists/template-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brand", category: "safety", items: ["Utrymningsväg"] }),
    }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("PATCH denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await PATCH(new Request("http://localhost/api/round-checklists/template-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brand", category: "safety", items: ["Utrymningsväg"] }),
    }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("DELETE rejects residents before deleting a template", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await DELETE(new Request("http://localhost/api/round-checklists/template-1", {
      method: "DELETE",
    }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("DELETE denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await DELETE(new Request("http://localhost/api/round-checklists/template-1", {
      method: "DELETE",
    }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
