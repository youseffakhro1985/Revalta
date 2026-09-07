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

  it("redacts nested Error messages, stacks and chained causes", () => {
    const cause = new Error("request failed Bearer private-provider-token");
    const error = new Error("connect postgresql://service:private-db-password@db.example/revalta", { cause });
    error.stack = "upstream failed token=private-stack-token";
    const serialized = JSON.stringify(sanitizeLogContext({ nested: { failure: error } }));

    expect(serialized).not.toContain("private-provider-token");
    expect(serialized).not.toContain("private-db-password");
    expect(serialized).not.toContain("private-stack-token");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("cause");
  });

  it("bounds cyclic Error causes and omits nested production stacks", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = new Error("token=nested-secret");
    error.cause = error;
    const serialized = JSON.stringify(serializeError(new Error("outer", { cause: error })));

    expect(serialized).toContain("[CIRCULAR]");
    expect(serialized).not.toContain("nested-secret");
    expect(serialized).not.toContain("stack");
  });

  it("redacts inline secrets from arbitrary context strings", () => {
    expect(sanitizeLogContext({
      upstream: "request failed password=plain-text&api_key=provider-key",
    })).toEqual({
      upstream: "request failed password=[REDACTED]&api_key=[REDACTED]",
    });
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
