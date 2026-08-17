import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "@/lib/auth";

describe("password hashing", () => {
  it("hashes new passwords with the serverless-safe bcrypt cost factor of 10", async () => {
    const hash = await hashPassword("StarktLosen123");
    // bcrypt hash format: $<algorithm>$<cost>$<salt+digest>
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it("round-trips through comparePassword", async () => {
    const hash = await hashPassword("StarktLosen123");
    await expect(comparePassword("StarktLosen123", hash)).resolves.toBe(true);
    await expect(comparePassword("FelLosenord", hash)).resolves.toBe(false);
  });

  it("continues to verify existing higher-cost hashes", async () => {
    const existingHash = await bcrypt.hash("BefintligtLosenord123", 12);
    expect(existingHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(comparePassword("BefintligtLosenord123", existingHash)).resolves.toBe(true);
  });
});
