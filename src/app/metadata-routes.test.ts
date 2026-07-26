import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("public metadata routes", () => {
  it("keeps private and token-bearing surfaces out of search crawlers", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallowed = rules.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );

    expect(result.host).toBe("https://www.revalta.se");
    expect(result.sitemap).toBe("https://www.revalta.se/sitemap.xml");
    expect(disallowed).toEqual(
      expect.arrayContaining([
        "/api/",
        "/dashboard/",
        "/reset-password",
        "/verify-email",
        "/accept-invite",
        "/portal",
      ]),
    );
  });

  it("publishes only canonical marketing and legal URLs", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual([
      "https://www.revalta.se",
      "https://www.revalta.se/juridik/integritet",
      "https://www.revalta.se/juridik/cookies",
      "https://www.revalta.se/juridik/villkor",
      "https://www.revalta.se/juridik/gdpr",
    ]);
    expect(urls.some((url) => url.includes("/dashboard") || url.includes("/portal"))).toBe(false);
  });
});
