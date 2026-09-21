import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, holderFindFirstMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  holderFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    leaseHolder: { findFirst: holderFindFirstMock },
  },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ holderId: "holder-1" });

describe("lease-holders/[holderId] mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH denies residents before looking up a holder", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/lease-holders/holder-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Andersson" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(holderFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the holder-edit copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/lease-holders/holder-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Andersson" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att redigera kontaktregistret");
    expect(holderFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies residents before looking up a holder", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await DELETE(new Request("http://localhost/api/lease-holders/holder-1", { method: "DELETE" }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(holderFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies technicians with the holder-delete copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await DELETE(new Request("http://localhost/api/lease-holders/holder-1", { method: "DELETE" }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att ta bort kontakter");
    expect(holderFindFirstMock).not.toHaveBeenCalled();
  });
});
