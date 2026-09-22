#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { runVerifiedPreview } from "./preview-runner.mjs";
import { runStaffGoldenPath, assertTicketHiddenAfterLogout } from "./golden-path.mjs";
import { runStaffBookingOverlap } from "./booking-concurrency.mjs";
import { runTechnicianRolePreview } from "./technician-role.mjs";
import { runResidentPortalPreview } from "./resident-portal.mjs";
import { isPaginatedPropertiesRequest, sanitizePreviewFailure, validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validatePropertiesResponse } from "./verification-contract.mjs";

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
        } catch {
          requestGateFailed = true;
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
          console.error("register request failed at browser network layer");
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
        companyId: fixtureCompany,
      });
      complete("technician-role-preview");

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
        () => registerResponse,
        REGISTER_DIAGNOSTIC_TIMEOUT_MS,
        `register POST was emitted but produced no response${registerRequestFailure ? ` (network failure: ${registerRequestFailure})` : ""}`,
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
