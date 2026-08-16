import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/session-policy";

const { createLoggerMock, loggerInfoMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

function logoutRequest(headers: Record<string, string> = {}) {
  return new Request("https://www.revalta.se/api/auth/logout", {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  it("clears the session cookies and returns success", async () => {
    const response = await POST(logoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });

    const expiredOptions = expiredSessionCookieOptions();

    const sessionCookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(sessionCookie).toMatchObject({
      name: SESSION_COOKIE_NAME,
      value: "",
      maxAge: 0,
      httpOnly: expiredOptions.httpOnly,
      sameSite: expiredOptions.sameSite,
      path: expiredOptions.path,
    });
    expect(sessionCookie?.expires).toEqual(new Date(0));

    const legacyCookie = response.cookies.get(LEGACY_SESSION_COOKIE_NAME);
    expect(legacyCookie).toMatchObject({
      name: LEGACY_SESSION_COOKIE_NAME,
      value: "",
      maxAge: 0,
      httpOnly: expiredOptions.httpOnly,
      sameSite: expiredOptions.sameSite,
      path: expiredOptions.path,
    });
    expect(legacyCookie?.expires).toEqual(new Date(0));
  });

  it("sets cache-control and clear-site-data headers", async () => {
    const response = await POST(logoutRequest());

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Clear-Site-Data")).toBe('"cache", "storage"');
  });

  it("succeeds even when no session cookie is present on the request", async () => {
    const response = await POST(logoutRequest());

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it("logs completion of the logout", async () => {
    await POST(logoutRequest());

    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth logout completed",
      expect.objectContaining({ event: "auth.logout.completed" }),
    );
  });

  it("correlates the response with the incoming request id", async () => {
    const requestId = "550e8400-e29b-41d4-a716-446655440000";
    const response = await POST(logoutRequest({ "x-request-id": requestId }));

    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("generates a request id when none is provided", async () => {
    const response = await POST(logoutRequest());

    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
