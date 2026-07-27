import { beforeEach, describe, expect, it, vi } from "vitest";

const { createLoggerMock, loggerInfoMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: createLoggerMock,
}));

import { POST } from "./route";

function logoutRequest(headers?: HeadersInit) {
  return new Request("https://www.revalta.se/api/auth/logout", {
    method: "POST",
    headers,
  });
}

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  it("returns a correlated private no-store response and expires both session cookies", async () => {
    const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const response = await POST(logoutRequest({ "x-request-id": requestId }));
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("clear-site-data")).toBe('"cache", "storage"');
    expect(setCookie).toContain("__Host-revalta_session=");
    expect(setCookie).toContain("token=");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });

  it("replaces a malformed request ID and logs only safe completion metadata", async () => {
    const response = await POST(logoutRequest({ "x-request-id": "attacker-controlled-value" }));
    const body = await response.json();

    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/auth/logout",
      method: "POST",
      requestId: body.requestId,
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth logout completed",
      expect.objectContaining({
        eventCode: "auth.logout.completed",
        status: 200,
        latencyMs: expect.any(Number),
      }),
    );

    const serializedLogCalls = JSON.stringify([createLoggerMock.mock.calls, loggerInfoMock.mock.calls]);
    expect(serializedLogCalls).not.toContain("attacker-controlled-value");
    expect(serializedLogCalls).not.toContain("__Host-revalta_session");
    expect(serializedLogCalls).not.toContain("token=");
  });
});
