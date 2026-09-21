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

import { GET } from "./route";

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
});
