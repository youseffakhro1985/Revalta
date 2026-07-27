/**
 * Fail-closed allowlists for the resident (boende) role.
 * Residents may only use the self-service portal surfaces listed here.
 */

import { isResident } from "@/lib/permissions";

export const RESIDENT_HOME_PATH = "/dashboard/boendeportal";
export const STAFF_HOME_PATH = "/dashboard";

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

/** Landing path after login or invite acceptance. */
export function homePathForRole(role: string) {
  return isResident(role) ? RESIDENT_HOME_PATH : STAFF_HOME_PATH;
}
