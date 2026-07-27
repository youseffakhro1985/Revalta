import { describe, expect, it } from "vitest";
import {
  homePathForRole,
  isPublicApiPath,
  isResidentAllowedApiPath,
  isResidentAllowedDashboardPath,
  isStaffOnlyApiPath,
  isStaffOnlyDashboardPath,
  residentHomePath,
} from "@/lib/resident-access";

describe("resident-access allowlists", () => {
  it("allows only the boendeportal dashboard surfaces", () => {
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal/dokument")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal/konto")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal/avier")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal/bokningar")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard/boendeportal/arenden/ticket-1")).toBe(true);
    expect(isResidentAllowedDashboardPath("/dashboard")).toBe(false);
    expect(isResidentAllowedDashboardPath("/dashboard/fastigheter")).toBe(false);
    expect(isResidentAllowedDashboardPath("/dashboard/felanmalan")).toBe(false);
  });

  it("marks other dashboard paths as staff-only", () => {
    expect(isStaffOnlyDashboardPath("/dashboard")).toBe(true);
    expect(isStaffOnlyDashboardPath("/dashboard/fastigheter")).toBe(true);
    expect(isStaffOnlyDashboardPath("/dashboard/boendeportal")).toBe(false);
    expect(isStaffOnlyDashboardPath("/dashboard/boendeportal/dokument")).toBe(false);
    expect(isStaffOnlyDashboardPath("/dashboard/boendeportal/konto")).toBe(false);
  });

  it("allows resident self-service APIs and blocks company APIs", () => {
    expect(isResidentAllowedApiPath("/api/resident-portal")).toBe(true);
    expect(isResidentAllowedApiPath("/api/resident-portal/documents/abc/download")).toBe(true);
    expect(isResidentAllowedApiPath("/api/resident-portal/tickets/ticket-1")).toBe(true);
    expect(isResidentAllowedApiPath("/api/resident-portal/tickets/ticket-1/comments")).toBe(true);
    expect(isResidentAllowedApiPath("/api/settings/profile")).toBe(true);
    expect(isResidentAllowedApiPath("/api/settings/password")).toBe(true);
    expect(isResidentAllowedApiPath("/api/auth/logout")).toBe(true);

    expect(isStaffOnlyApiPath("/api/properties")).toBe(true);
    expect(isStaffOnlyApiPath("/api/tickets")).toBe(true);
    expect(isStaffOnlyApiPath("/api/work-orders")).toBe(true);
    expect(isStaffOnlyApiPath("/api/leases")).toBe(true);
    expect(isStaffOnlyApiPath("/api/team")).toBe(true);
    expect(isStaffOnlyApiPath("/api/search")).toBe(true);
    expect(isStaffOnlyApiPath("/api/resident-portal")).toBe(false);
    expect(isStaffOnlyApiPath("/api/settings/profile")).toBe(false);
  });

  it("keeps public auth and cron endpoints open", () => {
    expect(isPublicApiPath("/api/auth/login")).toBe(true);
    expect(isPublicApiPath("/api/auth/register")).toBe(true);
    expect(isPublicApiPath("/api/auth/password-reset/request")).toBe(true);
    expect(isPublicApiPath("/api/stripe/webhook")).toBe(true);
    expect(isPublicApiPath("/api/cron/recurring-work-orders")).toBe(true);
    expect(isPublicApiPath("/api/team/invites/accept")).toBe(true);
    expect(isStaffOnlyApiPath("/api/auth/login")).toBe(false);
    expect(isStaffOnlyApiPath("/api/cron/recurring-work-orders")).toBe(false);
  });

  it("exposes a stable resident home path", () => {
    expect(residentHomePath()).toBe("/dashboard/boendeportal");
  });

  it("routes residents and staff to the right home after auth", () => {
    expect(homePathForRole("resident")).toBe("/dashboard/boendeportal");
    expect(homePathForRole("manager")).toBe("/dashboard");
    expect(homePathForRole("viewer")).toBe("/dashboard");
  });
});
