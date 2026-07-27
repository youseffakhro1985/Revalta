/**
 * Fail-closed allowlists for the resident (boende) role.
 * Residents may only use the self-service portal surfaces listed here.
 */

export const RESIDENT_HOME_PATH = "/dashboard/boendeportal";

const RESIDENT_DASHBOARD_PREFIXES = [
  "/dashboard/boendeportal",
] as const;

const RESIDENT_API_PREFIXES = [
  "/api/resident-portal",
  "/api/settings/profile",
  "/api/settings/password",
  "/api/auth/logout",
] as const;

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/password-reset",
  "/api/auth/email-verification",
  "/api/stripe/webhook",
  "/api/cron",
  "/api/team/invites/accept",
] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isResidentAllowedDashboardPath(pathname: string) {
  return matchesPrefix(pathname, RESIDENT_DASHBOARD_PREFIXES);
}

export function isResidentAllowedApiPath(pathname: string) {
  return matchesPrefix(pathname, RESIDENT_API_PREFIXES);
}

export function isPublicApiPath(pathname: string) {
  return matchesPrefix(pathname, PUBLIC_API_PREFIXES);
}

/** Staff workspace paths residents must not open (UI). */
export function isStaffOnlyDashboardPath(pathname: string) {
  return pathname === "/dashboard"
    || pathname.startsWith("/dashboard/")
    && !isResidentAllowedDashboardPath(pathname);
}

/** Company APIs residents must not call (data plane). */
export function isStaffOnlyApiPath(pathname: string) {
  return pathname.startsWith("/api/")
    && !isPublicApiPath(pathname)
    && !isResidentAllowedApiPath(pathname);
}

export function residentHomePath() {
  return RESIDENT_HOME_PATH;
}
