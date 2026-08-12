import { describe, expect, it } from "vitest";
import {
  isDeclaredRequestBodyTooLarge,
  isTrustedMutationRequest,
  requestBodyLimitBytes,
} from "@/lib/request-security";

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

describe("request body limits", () => {
  it("uses strict JSON and bounded multipart limits", () => {
    expect(requestBodyLimitBytes(request({ "content-type": "application/json; charset=utf-8" }))).toBe(1_000_000);
    expect(requestBodyLimitBytes(request({ "content-type": "multipart/form-data; boundary=test" }))).toBe(20 * 1024 * 1024);
    expect(requestBodyLimitBytes(request({ "content-type": "text/plain" }))).toBe(2_000_000);
  });

  it("rejects oversized or malformed declared lengths", () => {
    expect(isDeclaredRequestBodyTooLarge(request({
      "content-type": "application/json",
      "content-length": "1000001",
    }))).toBe(true);
    expect(isDeclaredRequestBodyTooLarge(request({
      "content-type": "application/json",
      "content-length": "not-a-number",
    }))).toBe(true);
  });

  it("accepts bounded and streaming requests for platform enforcement", () => {
    expect(isDeclaredRequestBodyTooLarge(request({
      "content-type": "application/json",
      "content-length": "1000000",
    }))).toBe(false);
    expect(isDeclaredRequestBodyTooLarge(request({ "content-type": "application/json" }))).toBe(false);
  });
});
