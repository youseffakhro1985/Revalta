import { describe, expect, it } from "vitest";
import {
  correlatedRequestHeaders,
  REQUEST_ID_HEADER,
  resolveRequestId,
  withRequestCorrelation,
} from "@/lib/request-correlation";

const validRequestId = "550e8400-e29b-41d4-a716-446655440000";

describe("request correlation", () => {
  it("preserves a valid UUID request ID", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: validRequestId.toUpperCase() });

    expect(resolveRequestId(headers, () => "unused")).toBe(validRequestId);
  });

  it("replaces malformed or untrusted request IDs", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "attacker-controlled-value" });
    const generated = "123e4567-e89b-42d3-a456-426614174000";

    expect(resolveRequestId(headers, () => generated)).toBe(generated);
  });

  it("propagates the correlation ID to downstream request headers", () => {
    const original = new Headers({ accept: "application/json" });
    const correlated = correlatedRequestHeaders(original, validRequestId);

    expect(correlated.get(REQUEST_ID_HEADER)).toBe(validRequestId);
    expect(correlated.get("accept")).toBe("application/json");
    expect(original.has(REQUEST_ID_HEADER)).toBe(false);
  });

  it("adds the correlation ID to every response type", () => {
    const response = withRequestCorrelation(new Response(null, { status: 403 }), validRequestId);

    expect(response.status).toBe(403);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(validRequestId);
  });
});
