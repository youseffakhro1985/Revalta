import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/service-notification-settings", () => ({
  getUserServicePreferences: vi.fn(),
  upsertUserServicePreferences: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { $transaction: vi.fn() },
}));

import { GET, PATCH } from "./route";

const resident = {
  id: "user-resident",
  company_id: "company-a",
  role: "resident",
  email: "boende@exempel.se",
  status: "active",
};

describe("settings personal service notifications staff scope", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(resident);
  });

  it("rejects resident reads and writes of staff service-notification preferences", async () => {
    const read = await GET();
    const write = await PATCH(new Request("https://www.revalta.se/api/settings/my-service-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }));
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
  });
});
