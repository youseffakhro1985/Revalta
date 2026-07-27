import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { verifyToken, findUnique } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ verifyToken }));
vi.mock("@/lib/db", () => ({
  default: { user: { findUnique } },
}));

import { proxy } from "@/proxy";
import { REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session-policy";

const validSession = {
  sub: "user-1",
  email: "owner@example.se",
  issuedAt: 1_785_000_000,
  passwordChangedAt: null,
};

const validRequestId = "550e8400-e29b-41d4-a716-446655440000";
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function dashboardRequest(path = "/dashboard", cookie?: string, requestId?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (requestId) headers.set(REQUEST_ID_HEADER, requestId);

  return new NextRequest(`https://www.revalta.se${path}`, { headers });
}

describe("request proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyToken.mockResolvedValue(validSession);
    findUnique.mockResolvedValue({
      role: "owner",
      status: "active",
      email: validSession.email,
    });
  });

  it("accepts the current host-only session cookie and propagates correlation", async () => {
    const response = await proxy(
      dashboardRequest("/dashboard", `${SESSION_COOKIE_NAME}=current-token`, validRequestId),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(validRequestId);
    expect(response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`)).toBe(validRequestId);
    expect(verifyToken).toHaveBeenCalledWith("current-token");
  });

  it("replaces malformed request IDs before forwarding", async () => {
    const response = await proxy(
      dashboardRequest("/dashboard", `${SESSION_COOKIE_NAME}=current-token`, "untrusted-value"),
    );
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    expect(requestId).toMatch(requestIdPattern);
    expect(requestId).not.toBe("untrusted-value");
    expect(response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`)).toBe(requestId);
  });

  it("keeps the controlled legacy-cookie fallback during migration", async () => {
    const response = await proxy(dashboardRequest("/dashboard", `${LEGACY_SESSION_COOKIE_NAME}=legacy-token`));

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
    expect(verifyToken).toHaveBeenCalledWith("legacy-token");
  });

  it("redirects unauthenticated dashboard requests to login with correlation", async () => {
    const response = await proxy(dashboardRequest("/dashboard", undefined, validRequestId));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/login?next=%2Fdashboard");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(validRequestId);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("rejects cross-site API mutations before application code runs", async () => {
    const request = new NextRequest("https://www.revalta.se/api/properties", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        [REQUEST_ID_HEADER]: validRequestId,
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(403);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(validRequestId);
    await expect(response.json()).resolves.toEqual({ error: "Otillåtet anrop" });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("redirects residents away from staff dashboard paths", async () => {
    findUnique.mockResolvedValue({
      role: "resident",
      status: "active",
      email: validSession.email,
    });

    const response = await proxy(
      dashboardRequest("/dashboard/fastigheter", `${SESSION_COOKIE_NAME}=current-token`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/dashboard/boendeportal");
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
  });

  it("allows residents on the boendeportal without blocking", async () => {
    findUnique.mockResolvedValue({
      role: "resident",
      status: "active",
      email: validSession.email,
    });

    const response = await proxy(
      dashboardRequest("/dashboard/boendeportal", `${SESSION_COOKIE_NAME}=current-token`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("blocks resident access to company APIs", async () => {
    findUnique.mockResolvedValue({
      role: "resident",
      status: "active",
      email: validSession.email,
    });

    const request = new NextRequest("https://www.revalta.se/api/properties", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=current-token` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
    await expect(response.json()).resolves.toEqual({
      error: "Boende har endast åtkomst till boendeportalen",
    });
  });

  it("allows resident portal APIs", async () => {
    findUnique.mockResolvedValue({
      role: "resident",
      status: "active",
      email: validSession.email,
    });

    const request = new NextRequest("https://www.revalta.se/api/resident-portal", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=current-token` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("sends residents from login to the boendeportal", async () => {
    findUnique.mockResolvedValue({
      role: "resident",
      status: "active",
      email: validSession.email,
    });

    const request = new NextRequest("https://www.revalta.se/login", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=current-token` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/dashboard/boendeportal");
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(requestIdPattern);
  });
});
