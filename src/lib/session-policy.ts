export const SESSION_COOKIE_NAME = "__Host-revalta_session";
export const LEGACY_SESSION_COOKIE_NAME = "token";
export const SESSION_ISSUER = "https://www.revalta.se";
export const SESSION_AUDIENCE = "revalta-web";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_CLOCK_TOLERANCE_SECONDS = 15;

export function sessionCookieOptions(production = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    priority: "high" as const,
  };
}

export function expiredSessionCookieOptions(production = process.env.NODE_ENV === "production") {
  return {
    ...sessionCookieOptions(production),
    maxAge: 0,
    expires: new Date(0),
  };
}
