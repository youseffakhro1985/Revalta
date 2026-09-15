import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  writeAuditLogMock,
  userUpdateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  userUpdateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    user: { update: userUpdateMock },
  },
}));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { PATCH, POST } from "./route";

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};

describe("settings profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(residentUser);
    writeAuditLogMock.mockResolvedValue(undefined);
    userUpdateMock.mockResolvedValue({
      id: "user-resident",
      email: "boende@exempel.se",
      name: "Ada Boende",
      role: "resident",
      status: "active",
      email_verified_at: null,
    });
  });

  it("updates the profile with JSON PATCH", async () => {
    const response = await PATCH(new Request("https://www.revalta.se/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada Boende" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-resident" },
      data: { name: "Ada Boende" },
    }));
  });

  it("accepts a native form profile save and redirects without putting the name in the URL", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/settings/profile", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Ada+Boende",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/dashboard/boendeportal/konto?saved=1");
    expect(response.headers.get("location")).not.toContain("Ada");
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "Ada Boende" },
    }));
  });

  it("returns the native form with a generic reason when the name is too long", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/settings/profile", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `name=${"A".repeat(121)}`,
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/dashboard/boendeportal/konto?reason=invalid");
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
