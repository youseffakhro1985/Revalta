import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword } from "@/lib/auth";

describe("password hashing", () => {
  it("hashes with a cost factor of 12", async () => {
    const hash = await hashPassword("StarktLosen123");
    // bcrypt hash format: $<algorithm>$<cost>$<salt+digest>
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("round-trips through comparePassword", async () => {
    const hash = await hashPassword("StarktLosen123");
    await expect(comparePassword("StarktLosen123", hash)).resolves.toBe(true);
    await expect(comparePassword("FelLosenord", hash)).resolves.toBe(false);
  });

  it("still verifies hashes generated at the older cost factor of 10", async () => {
    // Locks in bcrypt's backward compatibility: existing user rows hashed
    // before the cost factor was raised from 10 to 12 must keep working —
    // the cost is embedded in the hash itself, not read from BCRYPT_COST_FACTOR.
    const legacyHash = await bcrypt.hash("ÄldreLosenord123", 10);
    expect(legacyHash).toMatch(/^\$2[aby]\$10\$/);
    await expect(comparePassword("ÄldreLosenord123", legacyHash)).resolves.toBe(true);
  });
});
