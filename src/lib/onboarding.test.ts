import { describe, expect, it } from "vitest";
import { buildOnboardingProgress } from "@/lib/onboarding";

describe("first-run onboarding progress", () => {
  it("börjar på noll när organisationen saknar setup", () => {
    const progress = buildOnboardingProgress({
      companyConfigured: false,
      propertyCount: 0,
      activeTeamMembers: 1,
      pendingTeamInvites: 0,
      ticketIntakeVerified: false,
      notificationSettingsUpdatedAt: null,
    });

    expect(progress.completedCount).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it("räknar en väntande teaminbjudan som genomfört teamsteg", () => {
    const progress = buildOnboardingProgress({
      companyConfigured: true,
      propertyCount: 1,
      activeTeamMembers: 1,
      pendingTeamInvites: 1,
      ticketIntakeVerified: false,
      notificationSettingsUpdatedAt: null,
    });

    expect(progress.steps.find((step) => step.id === "team")?.completed).toBe(true);
    expect(progress.completedCount).toBe(3);
    expect(progress.percent).toBe(60);
  });

  it("kräver explicit verifierad felanmälan och sparade notifieringsinställningar", () => {
    const progress = buildOnboardingProgress({
      companyConfigured: true,
      propertyCount: 2,
      activeTeamMembers: 3,
      pendingTeamInvites: 0,
      ticketIntakeVerified: false,
      notificationSettingsUpdatedAt: null,
    });

    expect(progress.steps.find((step) => step.id === "ticket-intake")?.completed).toBe(false);
    expect(progress.steps.find((step) => step.id === "notifications")?.completed).toBe(false);
    expect(progress.complete).toBe(false);
  });

  it("blir helt klar när samtliga fem steg är verifierade", () => {
    const progress = buildOnboardingProgress({
      companyConfigured: true,
      propertyCount: 1,
      activeTeamMembers: 2,
      pendingTeamInvites: 0,
      ticketIntakeVerified: true,
      notificationSettingsUpdatedAt: "2026-08-17T07:00:00.000Z",
    });

    expect(progress.completedCount).toBe(5);
    expect(progress.percent).toBe(100);
    expect(progress.complete).toBe(true);
  });
});
