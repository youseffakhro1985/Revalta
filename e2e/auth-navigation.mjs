#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { runVerifiedPreview } from "./preview-runner.mjs";
import { runStaffGoldenPath, assertTicketHiddenAfterLogout } from "./golden-path.mjs";
import { runStaffBookingOverlap } from "./booking-concurrency.mjs";
import { runTechnicianRolePreview } from "./technician-role.mjs";
import { runViewerRolePreview } from "./viewer-role.mjs";
import { runManagerRolePreview } from "./manager-role.mjs";
import { runAdminRolePreview } from "./admin-role.mjs";
import { runResidentPortalPreview } from "./resident-portal.mjs";
import { isPaginatedPropertiesRequest, sanitizePreviewFailure, validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validateOwnerAssignQueueReadable, validateOwnerAuditReadable, validateOwnerBillingPlanRegistry, validateOwnerBillingPreviewDirectPlan, validateOwnerBillingPreviewInvalidPlan, validateOwnerBillingPreviewPlanChanged, validateOwnerBillingStripePortalReady, validateOwnerBillingStripeReadiness, validateOwnerCompanyManageable, validateOwnerIntegrationsReadable, validateOwnerLockBoardForceRelease, validateOwnerOnboardingEligible, validateOwnerOnboardingVerified, validateOwnerOperationsReadable, validateOwnerUnknownAccessNotFound, validateOwnerUnknownBookingNotFound, validateOwnerUnknownBudgetNotFound, validateOwnerUnknownBuildingNotFound, validateOwnerUnknownUnitNotFound, validateOwnerUnknownCalendarNotFound, validateOwnerUnknownChecklistNotFound, validateOwnerUnknownClaimNotFound, validateOwnerUnknownEnergyNotFound, validateOwnerUnknownDocumentNotFound, validateOwnerUnknownImdNotFound, validateOwnerUnknownOperationalDocumentNotFound, validateOwnerUnknownInspectionNotFound, validateOwnerUnknownLeaseHolderNotFound, validateOwnerUnknownRentNoticeNotFound, validateOwnerUnknownNotificationNotFound, validateOwnerUnknownMaintenanceNotFound, validateOwnerUnknownLeaseNotFound, validateOwnerUnknownProjectNotFound, validateOwnerUnknownPropertyNotFound, validateOwnerUnknownQuoteNotFound, validateOwnerUnknownRoundNotFound, validateOwnerUnknownTeamMemberNotFound, validateOwnerUnknownTicketNotFound, validateOwnerUnknownVendorNotFound, validateOwnerUnknownWorkOrderNotFound, validatePropertiesResponse } from "./verification-contract.mjs";

export async function runAuthNavigation(env = process.env, dependencies = {}) {
  return runVerifiedPreview(env, async ({ target, assertRelease, complete }) => {
    const { chromium } = dependencies.chromium ? dependencies : await import("playwright");

    const baseUrl = target.baseUrl;
    const bypass = String(env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
    const RESET_MAX_LATENCY_MS = 15_000;
    const RESET_NEUTRAL_MESSAGE = "Om kontot finns skickar vi en återställningslänk.";
    const VERIFY_RESEND_NEUTRAL_MESSAGE = "Om kontot behöver verifieras skickar vi en ny verifieringslänk.";
    const REGISTER_MAX_LATENCY_MS = 8_000;
    const REGISTER_REQUEST_EMIT_TIMEOUT_MS = 5_000;
    const REGISTER_DIAGNOSTIC_TIMEOUT_MS = 20_000;

    const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const email = `e2e-owner-${runId}@example.com`;
    const password = `RevaltaE2E!${runId.slice(-8)}9`;
    const companyName = `E2E Organisation ${runId.slice(-6)}`;

    function fail(message) {
      throw new Error(message);
    }

    async function expectVisible(locator, label, timeout = 15_000) {
      await locator.waitFor({ state: "visible", timeout }).catch(() => fail(`${label} was not visible`));
    }

    async function expectPath(page, pathname, timeout = 20_000) {
      await page.waitForFunction(
        (expectedPath) => window.location.pathname === expectedPath || window.location.pathname.startsWith(`${expectedPath}/`),
        pathname,
        { timeout },
      );
    }

    async function waitForValue(read, timeout, label) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      fail(`${label} within ${timeout}ms`);
    }

    const browser = await chromium.launch({ headless: true });
    let context;
    try {
      context = await browser.newContext({
        baseURL: baseUrl,
        serviceWorkers: "block",
        viewport: { width: 1440, height: 1000 },
      });
      let requestGateFailed = false;
      await context.route("**/*", async (route) => {
        const request = route.request();
        const sameOrigin = new URL(request.url()).origin === baseUrl;
        const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method());
        try {
          if (mutation) {
            if (!sameOrigin) fail("Cross-origin mutation is not allowed in release verification");
            await assertRelease();
          }
          await route.continue({ headers: {
            ...request.headers(),
            ...(sameOrigin && bypass ? { "x-vercel-protection-bypass": bypass } : {}),
          } });
        } catch (error) {
          requestGateFailed = true;
          const reason = error instanceof Error ? error.message.slice(0, 180) : "unknown";
          console.error(`release gate aborted a mutation: ${reason}`);
          await route.abort("blockedbyclient");
        }
      });
      const page = await context.newPage();
      const fixtureEmail = String(env.E2E_VERIFIED_EMAIL).trim();
      const fixtureCompany = String(env.E2E_VERIFIED_COMPANY_ID).trim();
      const pageErrors = [];
      let registerRequest = null;
      let registerResponse = null;
      let registerRequestFailure = null;

      page.on("pageerror", (error) => {
        pageErrors.push(error.name);
        console.error("PAGE_ERROR: browser script failed (details suppressed)");
      });

      page.on("request", (request) => {
        if (request.url().endsWith("/api/auth/register") && request.method() === "POST") {
          registerRequest = request;
          console.log("register request: POST emitted by browser");
        }
      });

      page.on("response", (response) => {
        if (response.url().endsWith("/api/auth/register") && response.request().method() === "POST") {
          registerResponse = response;
        }
      });

      page.on("requestfailed", (request) => {
        if (request.url().endsWith("/api/auth/register") && request.method() === "POST") {
          registerRequestFailure = request.failure()?.errorText || "unknown network failure";
          console.error(`register request failed at browser network layer: ${registerRequestFailure}`);
        }
      });

      console.log(`E2E auth/navigation against ${baseUrl}`);
      console.log("phase: verified-login");

      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated login form");
      await page.getByLabel("E-post").fill(fixtureEmail);
      await page.getByLabel("Lösenord").fill(env.E2E_VERIFIED_PASSWORD);
      const fixtureLoginPromise = page.waitForResponse(
        (response) => {
          try {
            return new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST";
          } catch {
            return false;
          }
        },
        { timeout: 45_000 },
      );
      await page.getByRole("button", { name: "Logga in" }).click();
      const fixtureLogin = await fixtureLoginPromise.catch(() => {
        if (requestGateFailed) fail("Login mutation was blocked by release identity verification");
        fail("Verified login response was not observed");
      });
      validateLoginResponse(fixtureLogin.status(), await fixtureLogin.json(), fixtureEmail);
      await expectPath(page, "/dashboard");
      const profile = await context.request.get(`${baseUrl}/api/settings/profile`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      const profileBody = await profile.json();
      validateFixtureProfile(profile.status(), profileBody, { email: fixtureEmail, companyId: fixtureCompany });
      const staffUserId = String(profileBody?.user?.id || "");
      if (!staffUserId) fail("Fixture profile did not include a user id");
      const billing = await context.request.get(`${baseUrl}/api/billing`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      const billingBody = await billing.json();
      validateOwnerBillingPreviewDirectPlan(billing.status(), billingBody);
      validateOwnerBillingPlanRegistry(billing.status(), billingBody);
      validateOwnerBillingStripeReadiness(billing.status(), billingBody);
      validateOwnerBillingStripePortalReady(billing.status(), billingBody);
      const currentPlan = billingBody?.currentPlan;
      if (currentPlan !== "start" && currentPlan !== "professional" && currentPlan !== "enterprise") {
        fail("Verified owner billing current plan was not an allowlisted storage id");
      }
      const nextPlan = currentPlan === "start" ? "professional" : "start";
      async function patchOwnerBillingPlan(plan) {
        return page.evaluate(async (nextPlan) => {
          const response = await fetch("/api/billing", {
            method: "PATCH",
            credentials: "same-origin",
            redirect: "manual",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ plan: nextPlan }),
          });
          let json = null;
          try {
            json = await response.json();
          } catch {
            json = null;
          }
          return { status: response.status, body: json };
        }, plan);
      }
      const changed = await patchOwnerBillingPlan(nextPlan);
      validateOwnerBillingPreviewPlanChanged(changed.status, changed.body, nextPlan);
      const restored = await patchOwnerBillingPlan(currentPlan);
      validateOwnerBillingPreviewPlanChanged(restored.status, restored.body, currentPlan);
      const invalidPlan = await patchOwnerBillingPlan("unlimited");
      validateOwnerBillingPreviewInvalidPlan(invalidPlan.status, invalidPlan.body);
      const onboarding = await context.request.get(`${baseUrl}/api/onboarding`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerOnboardingEligible(onboarding.status(), await onboarding.json());
      const onboardingWrite = await page.evaluate(async () => {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify-ticket-intake" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerOnboardingVerified(onboardingWrite.status, onboardingWrite.body);
      const integrations = await context.request.get(`${baseUrl}/api/integrations`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerIntegrationsReadable(integrations.status(), await integrations.json());
      const companySettings = await context.request.get(`${baseUrl}/api/settings/company`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerCompanyManageable(companySettings.status(), await companySettings.json(), fixtureCompany);
      const audit = await context.request.get(`${baseUrl}/api/audit`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerAuditReadable(audit.status(), await audit.json());
      const recurring = await context.request.get(`${baseUrl}/api/work-orders/recurring`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerOperationsReadable(recurring.status(), await recurring.json());
      const assignQueue = await context.request.get(`${baseUrl}/api/work-orders/unassigned-queue`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerAssignQueueReadable(assignQueue.status(), await assignQueue.json());
      const lockBoard = await context.request.get(`${baseUrl}/api/work-orders/edit-locks`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        maxRedirects: 0, timeout: 15_000,
      });
      validateOwnerLockBoardForceRelease(lockBoard.status(), await lockBoard.json());
      const unknownProperty = await page.evaluate(async () => {
        const response = await fetch("/api/properties/00000000-0000-4000-8000-000000000001", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "E2E unknown property" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownPropertyNotFound(unknownProperty.status, unknownProperty.body);
      const unknownTicket = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000002", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ priority: "normal" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketNotFound(unknownTicket.status, unknownTicket.body);
      const unknownWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000003", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: "E2E unknown work order" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderNotFound(unknownWorkOrder.status, unknownWorkOrder.body);
      const unknownLease = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000004", {
          method: "DELETE",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json" },
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownLeaseNotFound(unknownLease.status, unknownLease.body);
      const unknownProject = await page.evaluate(async () => {
        const response = await fetch("/api/projects/00000000-0000-4000-8000-000000000005", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: "E2E unknown project" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownProjectNotFound(unknownProject.status, unknownProject.body);
      const unknownInspection = await page.evaluate(async () => {
        const response = await fetch("/api/inspections/00000000-0000-4000-8000-000000000006", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: "E2E unknown inspection" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownInspectionNotFound(unknownInspection.status, unknownInspection.body);
      const unknownCalendar = await page.evaluate(async () => {
        const response = await fetch("/api/calendar", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: "00000000-0000-4000-8000-000000000007",
            status: "done",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownCalendarNotFound(unknownCalendar.status, unknownCalendar.body);
      const unknownTeamMember = await page.evaluate(async () => {
        const response = await fetch("/api/team/00000000-0000-4000-8000-000000000008", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ status: "inactive" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTeamMemberNotFound(unknownTeamMember.status, unknownTeamMember.body);
      const unknownRound = await page.evaluate(async () => {
        const response = await fetch("/api/rounds/00000000-0000-4000-8000-000000000009", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: "E2E unknown round" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownRoundNotFound(unknownRound.status, unknownRound.body);
      const unknownVendor = await page.evaluate(async () => {
        const response = await fetch("/api/vendors", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorId: "00000000-0000-4000-8000-000000000010",
            status: "ended",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownVendorNotFound(unknownVendor.status, unknownVendor.body);
      const unknownQuote = await page.evaluate(async () => {
        const response = await fetch("/api/quotes", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: "00000000-0000-4000-8000-000000000011",
            title: "E2E unknown quote",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownQuoteNotFound(unknownQuote.status, unknownQuote.body);
      const unknownChecklist = await page.evaluate(async () => {
        const response = await fetch("/api/round-checklists/00000000-0000-4000-8000-000000000012", {
          method: "DELETE",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json" },
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownChecklistNotFound(unknownChecklist.status, unknownChecklist.body);
      const unknownBooking = await page.evaluate(async () => {
        const response = await fetch("/api/bookings", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: "00000000-0000-4000-8000-000000000013",
            status: "cancelled",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownBookingNotFound(unknownBooking.status, unknownBooking.body);
      const unknownClaim = await page.evaluate(async () => {
        const response = await fetch("/api/insurance-claims", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            claimId: "00000000-0000-4000-8000-000000000014",
            title: "E2E unknown claim",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownClaimNotFound(unknownClaim.status, unknownClaim.body);
      const unknownEnergy = await page.evaluate(async () => {
        const response = await fetch("/api/energy", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            readingId: "00000000-0000-4000-8000-000000000015",
            note: "E2E unknown energy reading",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownEnergyNotFound(unknownEnergy.status, unknownEnergy.body);
      const unknownAccess = await page.evaluate(async () => {
        const response = await fetch("/api/access-credentials", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialId: "00000000-0000-4000-8000-000000000016",
            status: "blocked",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownAccessNotFound(unknownAccess.status, unknownAccess.body);
      const unknownImd = await page.evaluate(async () => {
        const response = await fetch("/api/imd-readings", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            readingId: "00000000-0000-4000-8000-000000000017",
            note: "E2E unknown IMD reading",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownImdNotFound(unknownImd.status, unknownImd.body);
      const unknownDocument = await page.evaluate(async () => {
        const response = await fetch("/api/documents", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: "00000000-0000-4000-8000-000000000018",
            name: "E2E unknown document",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownDocumentNotFound(unknownDocument.status, unknownDocument.body);
      const unknownOperationalDocument = await page.evaluate(async () => {
        const response = await fetch("/api/operational-documents/00000000-0000-4000-8000-000000000019", {
          method: "DELETE",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json" },
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownOperationalDocumentNotFound(
        unknownOperationalDocument.status,
        unknownOperationalDocument.body,
      );
      const unknownBudget = await page.evaluate(async () => {
        const response = await fetch("/api/budget", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: "00000000-0000-4000-8000-000000000020",
            note: "E2E unknown budget entry",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownBudgetNotFound(unknownBudget.status, unknownBudget.body);
      const unknownLeaseHolder = await page.evaluate(async () => {
        const response = await fetch("/api/lease-holders/00000000-0000-4000-8000-000000000021", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "E2E unknown lease holder" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownLeaseHolderNotFound(unknownLeaseHolder.status, unknownLeaseHolder.body);
      const unknownRentNotice = await page.evaluate(async () => {
        const response = await fetch("/api/rent-notices", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            noticeId: "00000000-0000-4000-8000-000000000022",
            note: "E2E unknown rent notice",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownRentNoticeNotFound(unknownRentNotice.status, unknownRentNotice.body);
      const unknownNotification = await page.evaluate(async () => {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId: "00000000-0000-4000-8000-000000000023",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownNotificationNotFound(unknownNotification.status, unknownNotification.body);
      const unknownMaintenance = await page.evaluate(async () => {
        const response = await fetch("/api/maintenance", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: "00000000-0000-4000-8000-000000000024",
            status: "cancelled",
          }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownMaintenanceNotFound(unknownMaintenance.status, unknownMaintenance.body);
      const unknownBuilding = await page.evaluate(async () => {
        const response = await fetch("/api/properties/00000000-0000-4000-8000-000000000025/buildings", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "E2E unknown building" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownBuildingNotFound(unknownBuilding.status, unknownBuilding.body);
      const unknownUnit = await page.evaluate(async () => {
        const response = await fetch("/api/properties/00000000-0000-4000-8000-000000000026/units", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ designation: "E2E unknown unit" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownUnitNotFound(unknownUnit.status, unknownUnit.body);
      complete("verified-login-and-profile");
      await expectVisible(page.getByRole("link", { name: "Fastigheter", exact: true }), "Fastigheter navigation");
      complete("dashboard");

      // Desktop critical navigation: compact IA + expandable Drift.
      await expectVisible(page.getByRole("link", { name: "Översikt", exact: true }), "Översikt navigation");
      await expectVisible(page.getByRole("button", { name: "Drift" }), "Drift navigation group");
      await page.getByRole("button", { name: "Drift" }).click();
      const desktopNavigation = page.getByRole("navigation", { name: "Dashboardmeny" });
      await expectVisible(desktopNavigation.getByRole("link", { name: "Ärenden", exact: true }), "Ärenden navigation");
      await expectVisible(desktopNavigation.getByRole("link", { name: "Arbetsordrar", exact: true }), "Arbetsordrar navigation");
      await expectVisible(desktopNavigation.getByRole("link", { name: "Kalender", exact: true }), "Kalender navigation");
      for (const nestedLabel of ["Arbetsorderöversikt", "Planering", "Återkommande"]) {
        if (await desktopNavigation.getByRole("link", { name: nestedLabel, exact: true }).count()) {
          fail(`${nestedLabel} leaked into the global Drift navigation`);
        }
      }
      complete("desktop-navigation");
      const propertiesPromise = page.waitForResponse(
        (response) => new URL(response.url()).origin === baseUrl && isPaginatedPropertiesRequest(response.url()),
        { timeout: 15_000 },
      );
      await desktopNavigation.getByRole("link", { name: "Fastigheter", exact: true }).click();
      await expectPath(page, "/dashboard/fastigheter");
      const properties = await propertiesPromise;
      validatePropertiesResponse(properties.status(), await properties.json());
      complete("properties-api");

      const golden = await runStaffGoldenPath({
        page,
        fail,
        expectVisible,
        expectPath,
        runId,
        staffUserId,
      });
      complete("golden-path-ticket-to-invoice");
      complete("golden-path-mobile-work-order");

      await runStaffBookingOverlap({
        page,
        runId,
        propertyId: golden.propertyId,
      });
      complete("booking-overlap-409");

      await runTechnicianRolePreview({
        browser,
        ownerPage: page,
        baseUrl,
        bypass,
        assertRelease,
        fail,
        expectVisible,
        expectPath,
        runId,
        workOrderId: golden.workOrderId,
        propertyId: golden.propertyId,
        companyId: fixtureCompany,
      });
      complete("technician-role-preview");

      await runViewerRolePreview({
        browser,
        ownerPage: page,
        baseUrl,
        bypass,
        assertRelease,
        fail,
        expectVisible,
        expectPath,
        runId,
        workOrderId: golden.workOrderId,
        companyId: fixtureCompany,
      });
      complete("viewer-role-preview");

      await runManagerRolePreview({
        browser,
        ownerPage: page,
        baseUrl,
        bypass,
        assertRelease,
        fail,
        expectVisible,
        expectPath,
        runId,
        workOrderId: golden.workOrderId,
        companyId: fixtureCompany,
      });
      complete("manager-role-preview");

      await runAdminRolePreview({
        browser,
        ownerPage: page,
        baseUrl,
        bypass,
        assertRelease,
        fail,
        expectVisible,
        expectPath,
        runId,
        workOrderId: golden.workOrderId,
        companyId: fixtureCompany,
      });
      complete("admin-role-preview");

      await runResidentPortalPreview({
        browser,
        ownerPage: page,
        baseUrl,
        bypass,
        assertRelease,
        fail,
        expectVisible,
        expectPath,
        runId,
        propertyId: golden.propertyId,
        workOrderId: golden.workOrderId,
        companyId: fixtureCompany,
      });
      complete("resident-portal-preview");

      // Command Center must be the single global search surface.
      await page.keyboard.press("Control+K");
      const commandCenter = page.getByRole("dialog", { name: "Revalta Command Center" });
      await expectVisible(commandCenter, "Command Center dialog");
      await expectVisible(commandCenter.getByText("Navigera", { exact: true }), "Command Center navigation section");
      const commandInput = commandCenter.getByLabel("Sök i Revalta eller välj kommando");
      const searchQuery = `missing-${runId}`;
      const searchPromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.origin === baseUrl && url.pathname === "/api/search" && url.searchParams.get("q") === searchQuery;
      }, { timeout: 15_000 });
      await commandInput.fill(searchQuery);
      const search = await searchPromise;
      validateEmptySearchResponse(search.status(), await search.json());
      await expectVisible(commandCenter.getByText(/Inga träffar för/i), "Command Center empty search state");
      await page.getByRole("button", { name: "Stäng Command Center" }).click();
      complete("command-center-api");

      // Mobile menu and mobile Command Center must both remain reachable.
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileMenuButton = page.getByRole("button", { name: "Öppna meny" });
      await expectVisible(mobileMenuButton, "mobile menu button");
      await mobileMenuButton.click();
      const mobileMenu = page.getByRole("dialog", { name: "Dashboardmeny" });
      await expectVisible(mobileMenu, "mobile dashboard menu");
      await expectVisible(mobileMenu.getByRole("link", { name: "Fastigheter", exact: true }), "mobile Fastigheter navigation");
      await expectVisible(mobileMenu.getByRole("button", { name: "Drift" }), "mobile Drift navigation group");
      const mobilePanel = mobileMenu.getByRole("complementary");
      await mobilePanel.getByRole("button", { name: "Stäng meny" }).click();

      const mobileCommandButton = page.getByRole("button", { name: "Öppna Revalta Command Center" });
      await expectVisible(mobileCommandButton, "mobile Command Center trigger");
      await mobileCommandButton.click();
      const mobileCommandCenter = page.getByRole("dialog", { name: "Revalta Command Center" });
      await expectVisible(mobileCommandCenter, "mobile Command Center dialog");
      await mobileCommandCenter.getByRole("button", { name: "Stäng Command Center" }).click();
      complete("mobile-navigation-and-command-center");

      // Logout and verify the protected dashboard is no longer the active surface.
      await page.setViewportSize({ width: 1440, height: 1000 });
      const logout = page.getByRole("button", { name: "Logga ut" }).first();
      await expectVisible(logout, "logout button");
      await logout.click();
      await expectPath(page, "/login");
      await expectVisible(page.getByRole("heading", { name: "Välkommen tillbaka" }), "login heading after logout");
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expectPath(page, "/login");
      await expectVisible(page.getByRole("heading", { name: "Välkommen tillbaka" }), "login heading after protected redirect");
      complete("logout-and-protected-redirect");
      await assertTicketHiddenAfterLogout(page, golden.ticketId);
      // Password reset does not depend on registration. Prove the issue #265 path first
      // so a separate registration-navigation flake cannot hide reset latency evidence.
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await expectVisible(page.getByRole("heading", { name: "Återställ ditt lösenord" }), "forgot-password heading");
      await expectVisible(page.locator("form#forgot-password-form[data-ready='1']"), "hydrated forgot-password form");
      await page.getByLabel("E-post").fill(`missing-reset-${runId}@example.com`);
      const resetStartedAt = Date.now();
      const resetResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/password-reset/request") && response.request().method() === "POST",
        { timeout: RESET_MAX_LATENCY_MS },
      );
      await page.getByRole("button", { name: "Skicka återställningslänk" }).click();
      const resetResponse = await resetResponsePromise;
      const resetLatencyMs = Date.now() - resetStartedAt;
      if (resetResponse.status() !== 200) {
        fail(`password-reset request returned HTTP ${resetResponse.status()}`);
      }
      const resetBody = await resetResponse.json();
      if (resetBody?.message !== RESET_NEUTRAL_MESSAGE) {
        fail("password-reset request did not preserve the neutral anti-enumeration response");
      }
      await expectVisible(page.getByText(RESET_NEUTRAL_MESSAGE, { exact: true }), "neutral password-reset confirmation");
      console.log(`password reset: neutral browser flow passed in ${resetLatencyMs}ms (limit ${RESET_MAX_LATENCY_MS}ms)`);

      // Register through the real browser form. Passive network listeners separate
      // browser submit emission from server response latency without leaving pending
      // Playwright promises that can mask the real diagnostic failure.
      await page.goto("/register", { waitUntil: "domcontentloaded" });
      await expectVisible(page.getByRole("heading", { name: "Skapa ditt Revalta-konto" }), "register heading");
      await expectVisible(page.locator("form#register-form[data-ready='1']"), "hydrated register form");
      await page.getByLabel("Namn").fill("Revalta E2E Owner");
      await page.getByLabel("Organisation").fill(companyName);
      const registerEmailInput = page.getByLabel("E-post");
      await registerEmailInput.fill(email);
      if ((await registerEmailInput.inputValue()) !== email) {
        fail("register email input did not retain the generated test address");
      }
      await page.getByLabel("Lösenord").fill(password);

      const registerForm = page.locator("form");
      const registerFormValid = await registerForm.evaluate((form) => form.checkValidity());
      if (!registerFormValid) {
        fail("register form failed native browser validation before submit");
      }

      registerRequest = null;
      registerResponse = null;
      registerRequestFailure = null;
      const registerStartedAt = Date.now();
      await page.getByRole("button", { name: "Skapa konto" }).click();
      await waitForValue(
        () => registerRequest,
        REGISTER_REQUEST_EMIT_TIMEOUT_MS,
        "register submit did not emit POST /api/auth/register",
      );
      const observedRegisterResponse = await waitForValue(
        () => {
          if (requestGateFailed) {
            fail("register mutation was blocked by release identity verification");
          }
          if (registerRequestFailure) {
            fail(`register POST did not produce a response (network failure: ${registerRequestFailure})`);
          }
          return registerResponse;
        },
        REGISTER_DIAGNOSTIC_TIMEOUT_MS,
        "register POST did not produce a response",
      );
      const registerLatencyMs = Date.now() - registerStartedAt;
      if (observedRegisterResponse.status() !== 201) {
        fail(`register request returned HTTP ${observedRegisterResponse.status()} after ${registerLatencyMs}ms`);
      }
      if (registerLatencyMs > REGISTER_MAX_LATENCY_MS) {
        fail(`register request exceeded latency SLO: HTTP 201 after ${registerLatencyMs}ms (limit ${REGISTER_MAX_LATENCY_MS}ms)`);
      }
      console.log(`register API: HTTP 201 in ${registerLatencyMs}ms (limit ${REGISTER_MAX_LATENCY_MS}ms)`);
      await expectPath(page, "/login");
      await expectVisible(page.getByRole("heading", { name: "Välkommen tillbaka" }), "login heading after registration");
      await expectVisible(
        page.getByText("Kontot är skapat. Kontrollera din e-post och verifiera adressen innan du loggar in.", { exact: true }),
        "registration verification notice",
      );
      console.log("register: browser flow passed");

      // A freshly registered account must not receive a session before proving
      // email ownership. This is intentionally the opposite of the pre-hardening
      // browser contract and protects against bypassing email verification.
      await page.getByLabel("E-post").fill(email);
      await page.getByLabel("Lösenord").fill(password);
      const blockedLoginResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
        { timeout: 10_000 },
      );
      await page.getByRole("button", { name: "Logga in" }).click();
      const blockedLoginResponse = await blockedLoginResponsePromise;
      if (blockedLoginResponse.status() !== 403) {
        fail(`fresh account login returned HTTP ${blockedLoginResponse.status()} instead of 403`);
      }
      const blockedLoginBody = await blockedLoginResponse.json();
      if (blockedLoginBody?.errorCode !== "EMAIL_VERIFICATION_REQUIRED") {
        fail("fresh account login did not return EMAIL_VERIFICATION_REQUIRED");
      }
      await expectPath(page, "/login");
      await expectVisible(
        page.getByText("Verifiera din e-postadress innan du loggar in.", { exact: true }),
        "email-verification-required error",
      );
      await expectVisible(page.getByRole("button", { name: "Skicka ny verifieringslänk" }), "verification resend action");
      console.log("email verification gate: unverified login correctly blocked");

      const resendResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/email-verification/resend") && response.request().method() === "POST",
        { timeout: 10_000 },
      );
      await page.getByRole("button", { name: "Skicka ny verifieringslänk" }).click();
      const resendResponse = await resendResponsePromise;
      if (resendResponse.status() !== 200) {
        fail(`verification resend returned HTTP ${resendResponse.status()}`);
      }
      const resendBody = await resendResponse.json();
      if (resendBody?.message !== VERIFY_RESEND_NEUTRAL_MESSAGE) {
        fail("verification resend did not preserve the neutral anti-enumeration response");
      }
      await expectVisible(page.getByText(VERIFY_RESEND_NEUTRAL_MESSAGE, { exact: true }), "neutral verification resend confirmation");
      complete("public-auth-verification");

      if (pageErrors.length > 0) {
        fail("Browser emitted page errors");
      }

      if (requestGateFailed) fail("A request failed release identity verification");
    } finally {
      try { await context?.close(); } finally { await browser.close(); }
    }

  }, dependencies.readHealth);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = await runAuthNavigation();
    console.log(JSON.stringify(evidence));
    console.log("OK: exact-SHA Preview browser verification completed all mandatory steps");
  } catch (error) {
    // Playwright errors can include form values, response bodies and cookies.
    console.error(`BLOCKED / NOT VERIFIED: ${sanitizePreviewFailure(error)}`);
    process.exitCode = 1;
  }
}
