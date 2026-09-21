import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  getWorkOrderEditLockMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  getWorkOrderEditLockMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/work-order-edit-lock", () => ({
  getWorkOrderEditLock: getWorkOrderEditLockMock,
  acquireWorkOrderEditLock: vi.fn(),
  releaseWorkOrderEditLock: vi.fn(),
  renewWorkOrderEditLock: vi.fn(),
}));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

describe("work-order edit-lock GET staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before looking up the work order or lock holder", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock"),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
    expect(getWorkOrderEditLockMock).not.toHaveBeenCalled();
  });

  it("POST rejects residents before looking up the work order", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });

  it("POST denies viewers with the edit-lock copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/edit-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att redigera arbetsordrar");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });
});
