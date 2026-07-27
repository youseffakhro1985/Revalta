import { describe, expect, it } from "vitest";
import { leaseHolderEmailMatch, reporterEmailMatch } from "@/lib/resident-portal-scope";

describe("resident portal scope", () => {
  it("builds case-insensitive lease holder email match", () => {
    expect(leaseHolderEmailMatch("  Ada@Example.COM ")).toEqual({
      deleted_at: null,
      email: { equals: "ada@example.com", mode: "insensitive" },
    });
  });

  it("builds reporter email match", () => {
    expect(reporterEmailMatch("Boende@Exempel.se")).toEqual({
      equals: "boende@exempel.se",
      mode: "insensitive",
    });
  });
});
