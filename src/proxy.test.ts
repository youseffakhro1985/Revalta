import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { verifyToken } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ verifyToken }));

import { proxy } from "@/proxy";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session-policy";

const validSession = {
  sub: "user-1",
  email: "owner@example.se",
  issuedAt: 1_785_000_000,
  passwordChangedAt: null,
};

function dashboardRequest(cookie?: string) {
  return new NextRequest("https://www.revalta.se/dashboard", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("request proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyToken.mockResolvedValue(validSession);
  });

  it("accepts the current host-only session cookie", async () => {
    const response = await proxy(dashboardRequest(`${SESSION_COOKIE_NAME}=current-token`));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(verifyToken).toHaveBeenCalledWith("current-token");
  });

  it("keeps the controlled legacy-cookie fallback during migration", async () => {
    const response = await proxy(dashboardRequest(`${LEGACY_SESSION_COOKIE_NAME}=legacy-token`));

    expect(response.status).toBe(200);
    expect(verifyToken).toHaveBeenCalledWith("legacy-token");
  });

  it("redirects unauthenticated dashboard requests to login", async () => {
    const response = await proxy(dashboardRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/login?next=%2Fdashboard");
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("rejects cross-site API mutations before application code runs", async () => {
    const request = new NextRequest("https://www.revalta.se/api/properties", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Otillåtet anrop" });
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
