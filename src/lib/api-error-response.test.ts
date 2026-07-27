import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { REQUEST_ID_HEADER } from "@/lib/request-correlation";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

describe("apiErrorResponse", () => {
  it("preserves the legacy error string while adding stable code and correlation", async () => {
    const response = apiErrorResponse({
      status: 403,
      code: API_ERROR_CODES.forbidden,
      message: "Åtkomst nekad",
      requestId,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Åtkomst nekad",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
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

  it("does not allow caller headers to weaken mandatory boundaries", () => {
    const response = apiErrorResponse({
      status: 429,
      code: API_ERROR_CODES.rateLimited,
      message: "För många anrop",
      requestId,
      headers: {
        "Cache-Control": "public, max-age=3600",
        [REQUEST_ID_HEADER]: "attacker-controlled",
        "Retry-After": "60",
      },
    });

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
