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

import { GET, POST } from "./route";

describe("round checklist templates staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
  });

  it("rejects residents before listing templates or creator emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("lets technicians list company checklist templates", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalled();
  });
});

describe("round checklist templates POST staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
  });

  it("rejects residents before creating a template", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/round-checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brand", category: "safety", items: ["Utrymningsväg"] }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(new Request("http://localhost/api/round-checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brand", category: "safety", items: ["Utrymningsväg"] }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
