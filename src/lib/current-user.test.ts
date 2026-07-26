import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, findFirst, verifyToken, cookieGet } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  verifyToken: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));

vi.mock("@/lib/session", () => ({ verifyToken }));
vi.mock("@/lib/db", () => ({
  default: { user: { findUnique }, auditLog: { findFirst } },
}));

import {
  auditScopedWhere,
  companyScopedWhere,
  companyUserWhere,
  getCurrentUser,
  requireCompanyUser,
  tenantWhere,
} from "@/lib/current-user";

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
    verifyToken.mockResolvedValue({
      sub: "user-1",
      email: activeUser.email,
      issuedAt: Math.floor(Date.now() / 1000),
      passwordChangedAt: null,
    });
    findFirst.mockResolvedValue(null);
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
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects sessions without a verified issue time", async () => {
    verifyToken.mockResolvedValue({
      sub: "user-1",
      email: activeUser.email,
      passwordChangedAt: null,
    });

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a session after the account email changes", async () => {
    findUnique.mockResolvedValue(activeUser);
    verifyToken.mockResolvedValue({
      sub: "user-1",
      email: "old-address@example.se",
      issuedAt: Math.floor(Date.now() / 1000),
      passwordChangedAt: null,
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("rejects a session issued for an earlier password security version", async () => {
    const passwordChangedAt = new Date("2026-07-22T16:00:00.000Z");
    findUnique.mockResolvedValue(activeUser);
    findFirst.mockResolvedValue({ created_at: passwordChangedAt });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("accepts a session bound to the latest password security version", async () => {
    const passwordChangedAt = new Date("2026-07-22T16:00:00.000Z");
    findUnique.mockResolvedValue(activeUser);
    findFirst.mockResolvedValue({ created_at: passwordChangedAt });
    verifyToken.mockResolvedValue({
      sub: "user-1",
      email: activeUser.email,
      issuedAt: Math.floor(Date.now() / 1000),
      passwordChangedAt: passwordChangedAt.getTime(),
    });

    await expect(getCurrentUser()).resolves.toEqual(activeUser);
  });
});

describe("tenant scoping helpers", () => {
  it("uses company scope when the user belongs to a company", () => {
    expect(tenantWhere(activeUser)).toEqual({ company_id: "company-1" });
    expect(companyScopedWhere(activeUser)).toEqual({ company_id: "company-1" });
    expect(auditScopedWhere(activeUser)).toEqual({ company_id: "company-1" });
    expect(companyUserWhere(activeUser)).toEqual({ company_id: "company-1" });
    expect(requireCompanyUser(activeUser)?.company_id).toBe("company-1");
  });

  it("never returns an undefined company filter for users without a company", () => {
    const soloUser = { ...activeUser, company_id: null, company: null };
    expect(tenantWhere(soloUser)).toEqual({ user_id: "user-1" });
    expect(companyScopedWhere(soloUser)).toEqual({ company_id: "__no_company_scope__" });
    expect(auditScopedWhere(soloUser)).toEqual({ actor_user_id: "user-1" });
    expect(companyUserWhere(soloUser)).toEqual({ id: "user-1" });
    expect(requireCompanyUser(soloUser)).toBeNull();
    expect(requireCompanyUser(null)).toBeNull();
  });
});
