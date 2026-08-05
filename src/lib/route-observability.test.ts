import { beforeEach, describe, expect, it, vi } from "vitest";

const { createLoggerMock } = vi.hoisted(() => ({ createLoggerMock: vi.fn() }));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { createRouteObservability } from "./route-observability";

describe("createRouteObservability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  it("normalizes request IDs and correlates downstream responses", () => {
    const requestId = "550E8400-E29B-41D4-A716-446655440000";
    const request = new Request("https://www.revalta.se/api/auth/login", {
      method: "POST",
      headers: { "x-request-id": requestId },
    });

    const observability = createRouteObservability(request, "/api/auth/login");
    const response = observability.correlate(Response.json({ ok: true }));

    expect(observability.requestId).toBe(requestId.toLowerCase());
    expect(response.headers.get("x-request-id")).toBe(requestId.toLowerCase());
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/auth/login",
      method: "POST",
      requestId: requestId.toLowerCase(),
    }));
  });

  it("replaces malformed external request IDs before logging", () => {
    const request = new Request("https://www.revalta.se/api/auth/login", {
      method: "POST",
      headers: { "x-request-id": "attacker-controlled" },
    });

    const observability = createRouteObservability(request, "/api/auth/login");

    expect(observability.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(observability.requestId).not.toBe("attacker-controlled");
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: observability.requestId,
    }));
  });
});
