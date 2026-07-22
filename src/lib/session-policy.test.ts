import { describe, expect, it } from "vitest";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

describe("session policy", () => {
  it("uses a host-only production cookie name", () => {
    expect(SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    expect(LEGACY_SESSION_COOKIE_NAME).toBe("token");
  });

  it("creates strict production cookie options", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      priority: "high",
      maxAge: SESSION_TTL_SECONDS,
    });
  });

  it("expires cookies deterministically", () => {
    const options = expiredSessionCookieOptions(true);
    expect(options.maxAge).toBe(0);
    expect(options.expires.getTime()).toBe(0);
  });
});
