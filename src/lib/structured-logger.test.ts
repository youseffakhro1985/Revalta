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

describe("nested Error security boundary", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it("redacts a provider Error.cause in the actual production log line", () => {
    vi.stubEnv("NODE_ENV", "production");
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("token=SYNTHETIC_TOKEN postgresql://user:SYNTHETIC_DB@db.test/db");
    cause.name = "secret=SYNTHETIC_NAME";
    createLogger().error("request failed", new Error("outer", { cause }));
    const line = String(output.mock.calls[0][0]);
    expect(line).not.toContain("SYNTHETIC_");
    expect(line).not.toContain('"stack"');
    expect(JSON.parse(line).error.cause.message).toContain("[REDACTED]");
  });
  it("sanitizes errors embedded in ordinary context and arrays", () => {
    const result = sanitizeLogContext({ items: [new Error("Bearer SYNTHETIC_ACCESS_TOKEN")], nested: { failure: new Error("password=SYNTHETIC_PASSWORD") } });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_");
  });
  it("redacts non-production nested stacks without hiding their diagnostic structure", () => {
    vi.stubEnv("NODE_ENV", "development");
    const cause = new Error("failure");
    cause.stack = "at provider (api_key=SYNTHETIC_KEY)";
    const result = serializeError(new Error("outer", { cause }));
    expect(JSON.stringify(result)).toContain("at provider");
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_KEY");
  });
  it("bounds circular and deeply nested error causes", () => {
    const cause = new Error("cycle");
    cause.cause = cause;
    expect(JSON.stringify(serializeError(cause))).toContain("[CIRCULAR]");
    let error = new Error("token=SYNTHETIC_DEEP");
    for (let i = 0; i < 20; i++) error = new Error("outer", { cause: error });
    const line = JSON.stringify(serializeError(error));
    expect(line).toContain("[MAX_DEPTH]");
    expect(line).not.toContain("SYNTHETIC_DEEP");
  });
});
