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
import { isPaginatedPropertiesRequest, sanitizePreviewFailure, validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validateOwnerAssignQueueReadable, validateOwnerAuditReadable, validateOwnerBillingPlanRegistry, validateOwnerBillingPreviewDirectPlan, validateOwnerBillingPreviewInvalidPlan, validateOwnerBillingPreviewPlanChanged, validateOwnerBillingStripePortalReady, validateOwnerBillingStripeReadiness, validateOwnerCompanyManageable, validateOwnerIntegrationsReadable, validateOwnerLockBoardForceRelease, validateOwnerOnboardingEligible, validateOwnerOnboardingVerified, validateOwnerOperationsReadable, validateOwnerUnknownAccessNotFound, validateOwnerUnknownBookingNotFound, validateOwnerUnknownBudgetNotFound, validateOwnerUnknownBuildingNotFound, validateOwnerUnknownComponentNotFound, validateOwnerUnknownTicketRestoreNotFound, validateOwnerUnknownWorkOrderRestoreNotFound, validateOwnerUnknownPropertyRestoreNotFound, validateOwnerUnknownProjectRestoreNotFound, validateOwnerUnknownLeaseRestoreNotFound, validateOwnerUnknownLeaseHolderRestoreNotFound, validateOwnerUnknownTicketCommentNotFound, validateOwnerUnknownWorkOrderCommentNotFound, validateOwnerUnknownProjectCommentNotFound, validateOwnerUnknownWorkOrderTimeEntryNotFound, validateOwnerUnknownWorkOrderMaterialNotFound, validateOwnerUnknownWorkOrderExecutionNotFound, validateOwnerUnknownTicketWorkOrderNotFound, validateOwnerUnknownInspectionWorkOrderNotFound, validateOwnerUnknownQuoteWorkOrderNotFound, validateOwnerUnknownInsuranceClaimWorkOrderNotFound, validateOwnerUnknownWorkOrderProjectNotFound, validateOwnerUnknownRoundWorkOrderNotFound, validateOwnerUnknownLeaseInspectionWorkOrderNotFound, validateOwnerUnknownWorkOrderDocumentNotFound, validateOwnerUnknownTicketAttachmentNotFound, validateOwnerUnknownMaintenancePlanWorkOrderNotFound, validateOwnerUnknownWorkOrderReportNotFound, validateOwnerUnknownWorkOrderSlaNotFound, validateOwnerUnknownWorkOrderEditLockNotFound, validateOwnerUnknownWorkOrderInvoiceBasisNotFound, validateOwnerUnknownWorkOrderProfitabilityNotFound, validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound, validateOwnerUnknownWorkOrderTransitionsNotFound, validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound, validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound, validateOwnerUnknownWorkOrderProfitabilityGetNotFound, validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound, validateOwnerUnknownWorkOrderAssetOptionsNotFound, validateOwnerUnknownWorkOrderAttestationNotFound, validateOwnerUnknownWorkOrderLockedUpdateNotFound, validateOwnerUnknownWorkOrderDocumentItemNotFound, validateOwnerUnknownTicketOperationsGetNotFound, validateOwnerUnknownTicketOperationsPostNotFound, validateOwnerUnknownTicketOperationsPatchNotFound, validateOwnerUnknownTicketOperationsDeleteNotFound, validateOwnerUnknownTicketTimelineNotFound, validateOwnerUnknownTicketSmsNotFound, validateOwnerUnknownTicketAiNotFound, validateOwnerUnknownLeaseHandoverNotFound, validateOwnerUnknownLeaseHandoverPutNotFound, validateOwnerUnknownLeaseInspectionItemsNotFound, validateOwnerUnknownLeaseInspectionItemsPutNotFound, validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound, validateOwnerUnknownUnitNotFound, validateOwnerUnknownCalendarNotFound, validateOwnerUnknownChecklistNotFound, validateOwnerUnknownClaimNotFound, validateOwnerUnknownEnergyNotFound, validateOwnerUnknownDocumentNotFound, validateOwnerUnknownImdNotFound, validateOwnerUnknownOperationalDocumentNotFound, validateOwnerUnknownInspectionNotFound, validateOwnerUnknownLeaseHolderNotFound, validateOwnerUnknownRentNoticeNotFound, validateOwnerUnknownNotificationNotFound, validateOwnerUnknownMaintenanceNotFound, validateOwnerUnknownLeaseNotFound, validateOwnerUnknownProjectNotFound, validateOwnerUnknownPropertyNotFound, validateOwnerUnknownQuoteNotFound, validateOwnerUnknownRoundNotFound, validateOwnerUnknownTeamMemberNotFound, validateOwnerUnknownTicketNotFound, validateOwnerUnknownVendorNotFound, validateOwnerUnknownWorkOrderNotFound, validatePropertiesResponse } from "./verification-contract.mjs";

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
      const unknownComponent = await page.evaluate(async () => {
        const listResponse = await fetch("/api/properties?page=1", {
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json" },
        });
        let listJson = null;
        try {
          listJson = await listResponse.json();
        } catch {
          listJson = null;
        }
        const propertyId = Array.isArray(listJson?.properties) ? listJson.properties[0]?.id : null;
        if (
          typeof propertyId !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId)
        ) {
          return { status: 0, body: null, propertyId: null };
        }
        const response = await fetch(`/api/properties/${propertyId}/components/00000000-0000-4000-8000-000000000027`, {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: "E2E unknown component" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json, propertyId };
      });
      if (!unknownComponent.propertyId) {
        fail("Verified owner unknown component did not have a fixture property");
      }
      validateOwnerUnknownComponentNotFound(unknownComponent.status, unknownComponent.body);
      const unknownTicketRestore = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000028/restore", {
          method: "POST",
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
      validateOwnerUnknownTicketRestoreNotFound(unknownTicketRestore.status, unknownTicketRestore.body);
      const unknownWorkOrderRestore = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000029/restore", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderRestoreNotFound(unknownWorkOrderRestore.status, unknownWorkOrderRestore.body);
      const unknownPropertyRestore = await page.evaluate(async () => {
        const response = await fetch("/api/properties/00000000-0000-4000-8000-000000000030/restore", {
          method: "POST",
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
      validateOwnerUnknownPropertyRestoreNotFound(unknownPropertyRestore.status, unknownPropertyRestore.body);
      const unknownProjectRestore = await page.evaluate(async () => {
        const response = await fetch("/api/projects/00000000-0000-4000-8000-000000000031/restore", {
          method: "POST",
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
      validateOwnerUnknownProjectRestoreNotFound(unknownProjectRestore.status, unknownProjectRestore.body);
      const unknownLeaseRestore = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000032/restore", {
          method: "POST",
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
      validateOwnerUnknownLeaseRestoreNotFound(unknownLeaseRestore.status, unknownLeaseRestore.body);
      const unknownLeaseHolderRestore = await page.evaluate(async () => {
        const response = await fetch("/api/lease-holders/00000000-0000-4000-8000-000000000033/restore", {
          method: "POST",
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
      validateOwnerUnknownLeaseHolderRestoreNotFound(unknownLeaseHolderRestore.status, unknownLeaseHolderRestore.body);
      const unknownTicketComment = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000034/comments", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ body: "E2E unknown ticket comment" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketCommentNotFound(unknownTicketComment.status, unknownTicketComment.body);
      const unknownWorkOrderComment = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000035/comments", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ body: "E2E unknown work-order comment" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderCommentNotFound(unknownWorkOrderComment.status, unknownWorkOrderComment.body);
      const unknownProjectComment = await page.evaluate(async () => {
        const response = await fetch("/api/projects/00000000-0000-4000-8000-000000000036/comments", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ body: "E2E unknown project comment" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownProjectCommentNotFound(unknownProjectComment.status, unknownProjectComment.body);
      const unknownWorkOrderTimeEntry = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000037/time-entries", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", kind: "work" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderTimeEntryNotFound(unknownWorkOrderTimeEntry.status, unknownWorkOrderTimeEntry.body);
      const unknownWorkOrderMaterial = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000038/materials", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", name: "E2E unknown material", quantity: 1, unitPrice: 1, unit: "st" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderMaterialNotFound(unknownWorkOrderMaterial.status, unknownWorkOrderMaterial.body);
      const unknownWorkOrderExecution = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000039/execution", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "checklist.create", title: "E2E unknown execution" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderExecutionNotFound(unknownWorkOrderExecution.status, unknownWorkOrderExecution.body);
      const unknownTicketWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000040/work-order", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketWorkOrderNotFound(unknownTicketWorkOrder.status, unknownTicketWorkOrder.body);
      const unknownInspectionWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/inspections/00000000-0000-4000-8000-000000000041/work-order", {
          method: "POST",
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
      validateOwnerUnknownInspectionWorkOrderNotFound(unknownInspectionWorkOrder.status, unknownInspectionWorkOrder.body);
      const unknownQuoteWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/quotes/00000000-0000-4000-8000-000000000042/work-order", {
          method: "POST",
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
      validateOwnerUnknownQuoteWorkOrderNotFound(unknownQuoteWorkOrder.status, unknownQuoteWorkOrder.body);
      const unknownInsuranceClaimWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/insurance-claims/00000000-0000-4000-8000-000000000043/work-order", {
          method: "POST",
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
      validateOwnerUnknownInsuranceClaimWorkOrderNotFound(unknownInsuranceClaimWorkOrder.status, unknownInsuranceClaimWorkOrder.body);
      const unknownWorkOrderProject = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000044/project", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderProjectNotFound(unknownWorkOrderProject.status, unknownWorkOrderProject.body);
      const unknownRoundWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/rounds/00000000-0000-4000-8000-000000000045/work-orders", {
          method: "POST",
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
      validateOwnerUnknownRoundWorkOrderNotFound(unknownRoundWorkOrder.status, unknownRoundWorkOrder.body);
      const unknownLeaseInspectionWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000046/inspection-work-orders", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: ["e2e-unknown"] }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownLeaseInspectionWorkOrderNotFound(unknownLeaseInspectionWorkOrder.status, unknownLeaseInspectionWorkOrder.body);
      const unknownWorkOrderDocument = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000047/documents", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderDocumentNotFound(unknownWorkOrderDocument.status, unknownWorkOrderDocument.body);
      const unknownTicketAttachment = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000048/attachments", {
          method: "POST",
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
      validateOwnerUnknownTicketAttachmentNotFound(unknownTicketAttachment.status, unknownTicketAttachment.body);
      const unknownMaintenancePlanWorkOrder = await page.evaluate(async () => {
        const response = await fetch("/api/properties/00000000-0000-4000-8000-000000000049/maintenance-plan/action/work-order", {
          method: "POST",
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
      validateOwnerUnknownMaintenancePlanWorkOrderNotFound(unknownMaintenancePlanWorkOrder.status, unknownMaintenancePlanWorkOrder.body);
      const unknownWorkOrderReport = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000050/reports", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderReportNotFound(unknownWorkOrderReport.status, unknownWorkOrderReport.body);
      const unknownWorkOrderSla = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000051/sla", {
          method: "PATCH",
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
      validateOwnerUnknownWorkOrderSlaNotFound(unknownWorkOrderSla.status, unknownWorkOrderSla.body);
      const unknownWorkOrderEditLock = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000052/edit-lock", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderEditLockNotFound(unknownWorkOrderEditLock.status, unknownWorkOrderEditLock.body);
      const unknownWorkOrderInvoiceBasis = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000053/invoice-basis", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rebuild" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderInvoiceBasisNotFound(unknownWorkOrderInvoiceBasis.status, unknownWorkOrderInvoiceBasis.body);
      const unknownWorkOrderProfitability = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000054/profitability", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderProfitabilityNotFound(unknownWorkOrderProfitability.status, unknownWorkOrderProfitability.body);
      const unknownWorkOrderInvoiceIntegration = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000055/invoice-integration", {
          method: "POST",
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
      validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound(unknownWorkOrderInvoiceIntegration.status, unknownWorkOrderInvoiceIntegration.body);
      const unknownWorkOrderTransitions = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000056/transitions", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderTransitionsNotFound(unknownWorkOrderTransitions.status, unknownWorkOrderTransitions.body);
      const unknownWorkOrderInvoiceBasisGet = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000057/invoice-basis", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound(unknownWorkOrderInvoiceBasisGet.status, unknownWorkOrderInvoiceBasisGet.body);
      const unknownWorkOrderInvoiceBasisExport = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000058/invoice-basis/export?format=json", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound(unknownWorkOrderInvoiceBasisExport.status, unknownWorkOrderInvoiceBasisExport.body);
      const unknownWorkOrderProfitabilityGet = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000059/profitability", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderProfitabilityGetNotFound(unknownWorkOrderProfitabilityGet.status, unknownWorkOrderProfitabilityGet.body);
      const unknownWorkOrderInvoiceIntegrationGet = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000060/invoice-integration", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound(unknownWorkOrderInvoiceIntegrationGet.status, unknownWorkOrderInvoiceIntegrationGet.body);
      const unknownWorkOrderAssetOptions = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000061/asset-options", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderAssetOptionsNotFound(unknownWorkOrderAssetOptions.status, unknownWorkOrderAssetOptions.body);
      const unknownWorkOrderAttestation = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000062/attestation", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approveSubmitted" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderAttestationNotFound(unknownWorkOrderAttestation.status, unknownWorkOrderAttestation.body);
      const unknownWorkOrderLockedUpdate = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000063/locked-update", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress", editToken: "e2e-locked-update", version: 1 }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownWorkOrderLockedUpdateNotFound(unknownWorkOrderLockedUpdate.status, unknownWorkOrderLockedUpdate.body);
      const unknownWorkOrderDocumentItem = await page.evaluate(async () => {
        const response = await fetch("/api/work-orders/00000000-0000-4000-8000-000000000064/documents/00000000-0000-4000-8000-000000000164", {
          method: "GET",
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
      validateOwnerUnknownWorkOrderDocumentItemNotFound(unknownWorkOrderDocumentItem.status, unknownWorkOrderDocumentItem.body);
      const unknownTicketOperationsGet = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000065/operations", {
          method: "GET",
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
      validateOwnerUnknownTicketOperationsGetNotFound(unknownTicketOperationsGet.status, unknownTicketOperationsGet.body);
      const unknownTicketOperationsPost = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000066/operations", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ type: "note", description: "E2E unknown ticket operation" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketOperationsPostNotFound(unknownTicketOperationsPost.status, unknownTicketOperationsPost.body);
      const unknownTicketOperationsPatch = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000067/operations", {
          method: "PATCH",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ operationId: "00000000-0000-4000-8000-000000000167", description: "E2E unknown ticket operation patch" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketOperationsPatchNotFound(unknownTicketOperationsPatch.status, unknownTicketOperationsPatch.body);
      const unknownTicketOperationsDelete = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000068/operations", {
          method: "DELETE",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ operationId: "00000000-0000-4000-8000-000000000168" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketOperationsDeleteNotFound(unknownTicketOperationsDelete.status, unknownTicketOperationsDelete.body);
      const unknownTicketTimeline = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000069/timeline", {
          method: "GET",
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
      validateOwnerUnknownTicketTimelineNotFound(unknownTicketTimeline.status, unknownTicketTimeline.body);
      const unknownTicketSms = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000070/sms", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ message: "E2E unknown ticket SMS" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketSmsNotFound(unknownTicketSms.status, unknownTicketSms.body);
      const unknownTicketAi = await page.evaluate(async () => {
        const response = await fetch("/api/tickets/00000000-0000-4000-8000-000000000071/ai", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "E2E unknown ticket AI" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownTicketAiNotFound(unknownTicketAi.status, unknownTicketAi.body);
      const unknownLeaseHandover = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000072/handover", {
          method: "GET",
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
      validateOwnerUnknownLeaseHandoverNotFound(unknownLeaseHandover.status, unknownLeaseHandover.body);
      const unknownLeaseHandoverPut = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000073/handover", {
          method: "PUT",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "move_in", generalNote: "E2E unknown lease handover" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownLeaseHandoverPutNotFound(unknownLeaseHandoverPut.status, unknownLeaseHandoverPut.body);
      const unknownLeaseInspectionItems = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000074/inspection-items", {
          method: "GET",
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
      validateOwnerUnknownLeaseInspectionItemsNotFound(unknownLeaseInspectionItems.status, unknownLeaseInspectionItems.body);
      const unknownLeaseInspectionItemsPut = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000075/inspection-items", {
          method: "PUT",
          credentials: "same-origin",
          redirect: "manual",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ area: "E2E", component: "unknown lease inspection items" }] }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, body: json };
      });
      validateOwnerUnknownLeaseInspectionItemsPutNotFound(unknownLeaseInspectionItemsPut.status, unknownLeaseInspectionItemsPut.body);
      const unknownLeaseInspectionItemWorkOrdersGet = await page.evaluate(async () => {
        const response = await fetch("/api/leases/00000000-0000-4000-8000-000000000076/inspection-items/work-orders", {
          method: "GET",
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
      validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound(unknownLeaseInspectionItemWorkOrdersGet.status, unknownLeaseInspectionItemWorkOrdersGet.body);
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
