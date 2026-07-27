import { describe, expect, it } from "vitest";
import { validateReleaseTarget } from "./validate-release-target.mjs";

const SHA = "2d06e567383a9347bfd49f2bfe83cf8f302ee872";

describe("validateReleaseTarget", () => {
  it("accepts the controlled preview target", () => {
    expect(validateReleaseTarget({
      baseUrl: "https://revalta-release-preview.vercel.app",
      expectedSha: SHA,
      environment: "preview",
      branch: "release-preview",
    })).toEqual({
      baseUrl: "https://revalta-release-preview.vercel.app",
      expectedSha: SHA,
      environment: "preview",
      branch: "release-preview",
    });
  });

  it("accepts only the canonical production target", () => {
    expect(validateReleaseTarget({
      baseUrl: "https://www.revalta.se",
      expectedSha: SHA,
      environment: "production",
      branch: "main",
    }).baseUrl).toBe("https://www.revalta.se");

    expect(() => validateReleaseTarget({
      baseUrl: "https://revalta.se",
      expectedSha: SHA,
      environment: "production",
      branch: "main",
    })).toThrow("www.revalta.se");
  });

  it("rejects unsafe or ambiguous URLs", () => {
    const invalidUrls = [
      "http://preview.example",
      "https://user:pass@preview.example",
      "https://preview.example:8443",
      "https://preview.example/path",
      "https://preview.example?target=other",
      "https://preview.example#fragment",
    ];

    for (const baseUrl of invalidUrls) {
      expect(() => validateReleaseTarget({
        baseUrl,
        expectedSha: SHA,
        environment: "preview",
        branch: "release-preview",
      })).toThrow();
    }
  });

  it("rejects branch and environment confusion", () => {
    expect(() => validateReleaseTarget({
      baseUrl: "https://preview.example",
      expectedSha: SHA,
      environment: "preview",
      branch: "main",
    })).toThrow("release-preview");

    expect(() => validateReleaseTarget({
      baseUrl: "https://www.revalta.se",
      expectedSha: SHA,
      environment: "preview",
      branch: "release-preview",
    })).toThrow("production origin");
  });

  it("requires a full commit SHA", () => {
    expect(() => validateReleaseTarget({
      baseUrl: "https://preview.example",
      expectedSha: "2d06e56",
      environment: "preview",
      branch: "release-preview",
    })).toThrow("40-character");
  });
});
