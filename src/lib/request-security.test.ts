import { describe, expect, it } from "vitest";
import { isTrustedMutationRequest } from "@/lib/request-security";

function request(headers: Record<string, string>) {
  return new Request("https://internal.vercel.test/api/auth/login", { method: "POST", headers });
}

describe("mutation origin protection", () => {
  it("accepts the public origin reported by the trusted proxy", () => {
    expect(
      isTrustedMutationRequest(
        request({
          origin: "https://www.revalta.se",
          "x-forwarded-host": "www.revalta.se",
          "x-forwarded-proto": "https",
          "sec-fetch-site": "same-origin",
        })
      )
    ).toBe(true);
  });

  it("rejects a foreign origin even when the internal URL differs", () => {
    expect(
      isTrustedMutationRequest(
        request({
          origin: "https://evil.example",
          "x-forwarded-host": "www.revalta.se",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe(false);
  });

  it("rejects cross-site browser requests without an Origin header", () => {
    expect(isTrustedMutationRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("allows server-to-server calls without browser origin metadata", () => {
    expect(isTrustedMutationRequest(request({}))).toBe(true);
  });
});
