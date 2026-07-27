import { describe, expect, it } from "vitest";
import {
  correlatedRequestHeaders,
  normalizeRequestId,
  REQUEST_ID_HEADER,
  resolveRequestId,
  withRequestCorrelation,
} from "@/lib/request-correlation";

const validRequestId = "550e8400-e29b-41d4-a716-446655440000";
const generatedRequestId = "123e4567-e89b-42d3-a456-426614174000";

describe("request correlation", () => {
  it("preserves and normalizes a valid UUID request ID", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: validRequestId.toUpperCase() });

    expect(resolveRequestId(headers, () => "unused")).toBe(validRequestId);
    expect(normalizeRequestId(`  ${validRequestId.toUpperCase()}  `, () => "unused")).toBe(validRequestId);
  });

  it("replaces malformed or untrusted request IDs", () => {
    const headers = new Headers({ [REQUEST_ID_HEADER]: "attacker-controlled-value" });

    expect(resolveRequestId(headers, () => generatedRequestId)).toBe(generatedRequestId);
    expect(normalizeRequestId("not-a-uuid", () => generatedRequestId)).toBe(generatedRequestId);
  });

  it("fails closed when the request ID generator returns invalid data", () => {
    expect(() => normalizeRequestId(undefined, () => "invalid-generated-id")).toThrow(
      "Request ID generator returned an invalid UUID",
    );
  });

  it("propagates the correlation ID to downstream request headers", () => {
    const original = new Headers({ accept: "application/json" });
    const correlated = correlatedRequestHeaders(original, validRequestId.toUpperCase());

    expect(correlated.get(REQUEST_ID_HEADER)).toBe(validRequestId);
    expect(correlated.get("accept")).toBe("application/json");
    expect(original.has(REQUEST_ID_HEADER)).toBe(false);
  });

  it("adds only a normalized correlation ID to every response type", () => {
    const response = withRequestCorrelation(
      new Response(null, { status: 403 }),
      validRequestId.toUpperCase(),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(validRequestId);
  });
});
