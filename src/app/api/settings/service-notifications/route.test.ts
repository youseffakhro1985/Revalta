import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/service-notification-settings", () => ({
  getCompanyServicePreferences: vi.fn(),
  serviceNotificationAllowedRoles: ["owner", "admin"],
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: vi.fn(async () => ""),
}));

import { GET, PATCH, POST } from "./route";

const resident = {
  id: "user-resident",
  company_id: "company-a",
  role: "resident",
  email: "boende@exempel.se",
  status: "active",
};

describe("settings service notifications staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(resident);
  });

  it("rejects resident reads of organisation notification settings and recipient emails", async () => {
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("rejects resident writes and test sends", async () => {
    const patch = await PATCH(new Request("https://www.revalta.se/api/settings/service-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daysAhead: 7, roles: ["owner"] }),
    }));
    const post = await POST();
    expect(patch.status).toBe(403);
    expect(post.status).toBe(403);
  });
});
