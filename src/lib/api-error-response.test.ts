import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { REQUEST_ID_HEADER } from "@/lib/request-correlation";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("apiErrorResponse", () => {
  it("preserves the legacy error string while adding stable code and correlation", async () => {
    const response = apiErrorResponse({
      status: 403,
      code: API_ERROR_CODES.forbidden,
      message: "  Åtkomst nekad  ",
      requestId: requestId.toUpperCase(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Åtkomst nekad",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
  });

  it("replaces malformed request IDs before exposing them", async () => {
    const response = apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Ett internt fel inträffade",
      requestId: "attacker-controlled",
    });
    const body = await response.json();

    expect(body.requestId).toMatch(requestIdPattern);
    expect(body.requestId).not.toBe("attacker-controlled");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(body.requestId);
  });

  it("enforces private no-store and security headers", () => {
    const response = apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Ett internt fel inträffade",
      requestId,
    });

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("only preserves explicitly allowed supplemental headers", () => {
    const response = apiErrorResponse({
      status: 429,
      code: API_ERROR_CODES.rateLimited,
      message: "För många anrop",
      requestId,
      headers: {
        "Cache-Control": "public, max-age=3600",
        [REQUEST_ID_HEADER]: "attacker-controlled",
        "Retry-After": "60",
        "Access-Control-Allow-Origin": "*",
        "Set-Cookie": "session=attacker",
        "X-Untrusted": "value",
      },
    });

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("x-untrusted")).toBe(false);
  });

  it.each([200, 399, 600, 403.5, Number.NaN])(
    "rejects invalid error status %s",
    (status) => {
      expect(() => apiErrorResponse({
        status,
        code: API_ERROR_CODES.internalError,
        message: "Fel",
        requestId,
      })).toThrow(RangeError);
    },
  );

  it("rejects empty or unreasonably large public messages", () => {
    expect(() => apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "   ",
      requestId,
    })).toThrow("non-empty public message");

    expect(() => apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "x".repeat(501),
      requestId,
    })).toThrow("exceeds 500 characters");
  });
});
