import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, sanitizeLogContext, serializeError } from "./structured-logger";

describe("structured server logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("redacts nested secrets and handles circular objects", () => {
    const circular: Record<string, unknown> = { token: "secret", nested: { password: "pw" } };
    circular.self = circular;

    expect(sanitizeLogContext(circular)).toEqual({
      token: "[REDACTED]",
      nested: { password: "[REDACTED]" },
      self: "[CIRCULAR]",
    });
  });

  it("redacts credentials embedded in free-form strings and errors", () => {
    const serialized = serializeError(new Error(
      "connect postgresql://service:db-password@db.example/revalta?token=query-token",
    ));

    expect(serialized).toEqual({
      error: expect.objectContaining({
        message: "connect postgresql://service:[REDACTED]@db.example/revalta?token=[REDACTED]",
      }),
    });
  });

  it("redacts bearer tokens from log messages", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logger = createLogger();

    logger.warn("upstream rejected Bearer eyJhbGciOi.secret.signature");

    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.message).toBe("upstream rejected Bearer [REDACTED]");
  });

  it("prevents context from overriding reserved log fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const logger = createLogger({ service: "attacker", level: "error", requestId: "req-1" });

    logger.info("healthy", { message: "spoofed", timestamp: "yesterday" });

    const payload = JSON.parse(String(info.mock.calls[0][0]));
    expect(payload).toMatchObject({
      service: "revalta",
      level: "info",
      message: "healthy",
      requestId: "req-1",
    });
    expect(payload.timestamp).not.toBe("yesterday");
  });

  it("omits stack traces in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const serialized = serializeError(new Error("database unavailable"));

    expect(serialized).toEqual({
      error: {
        name: "Error",
        message: "database unavailable",
        cause: undefined,
      },
    });
  });

  it("writes one JSON line at the requested severity", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger({ route: "/api/health", requestId: "req-2" });

    logger.error("health check failed", new Error("boom"), { latencyMs: 42 });

    expect(error).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(error.mock.calls[0][0]));
    expect(payload).toMatchObject({
      level: "error",
      service: "revalta",
      message: "health check failed",
      route: "/api/health",
      requestId: "req-2",
      latencyMs: 42,
      error: { name: "Error", message: "boom" },
    });
  });
});
