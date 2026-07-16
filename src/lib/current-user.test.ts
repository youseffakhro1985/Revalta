import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, verifyToken, cookieGet } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifyToken: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));

vi.mock("@/lib/session", () => ({ verifyToken }));
vi.mock("@/lib/db", () => ({
  default: { user: { findUnique } },
}));

import { getCurrentUser } from "@/lib/current-user";

const activeUser = {
  id: "user-1",
  email: "owner@example.se",
  name: "Anna",
  role: "owner",
  status: "active",
  company_id: "company-1",
  email_verified_at: new Date(),
  created_at: new Date(),
  company: { id: "company-1", name: "Revalta Test", plan: "start", status: "active" },
};

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockReturnValue({ value: "signed-token" });
    verifyToken.mockResolvedValue({ sub: "user-1" });
  });

  it("returns an active user in an active company", async () => {
    findUnique.mockResolvedValue(activeUser);
    await expect(getCurrentUser()).resolves.toEqual(activeUser);
  });

  it("rejects inactive users", async () => {
    findUnique.mockResolvedValue({ ...activeUser, status: "inactive" });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("rejects users in inactive companies", async () => {
    findUnique.mockResolvedValue({
      ...activeUser,
      company: { ...activeUser.company, status: "suspended" },
    });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("does not query the database without a valid session", async () => {
    verifyToken.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
