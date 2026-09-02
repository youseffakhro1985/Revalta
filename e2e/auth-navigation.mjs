#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const baseUrl = String(process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
const allowHttpLocalhost = String(process.env.E2E_ALLOW_HTTP_LOCALHOST || "").trim() === "1";
const RESET_MAX_LATENCY_MS = 8_000;
const RESET_NEUTRAL_MESSAGE = "Om kontot finns skickar vi en återställningslänk.";
const VERIFY_RESEND_NEUTRAL_MESSAGE = "Om kontot behöver verifieras skickar vi en ny verifieringslänk.";
const REGISTER_MAX_LATENCY_MS = 8_000;
const REGISTER_REQUEST_EMIT_TIMEOUT_MS = 5_000;
const REGISTER_DIAGNOSTIC_TIMEOUT_MS = 20_000;

const isHttpsOrigin = /^https:\/\//.test(baseUrl);
const isAllowedLocalOrigin = allowHttpLocalhost && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseUrl);
if (!baseUrl || (!isHttpsOrigin && !isAllowedLocalOrigin)) {
  console.error("E2E_BASE_URL must be an https Preview origin, or an explicitly allowed localhost origin");
  process.exit(1);
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function markLocalAccountVerified() {
  if (!isAllowedLocalOrigin) return false;

  const prisma = new PrismaClient();
  try {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { email_verified_at: new Date() },
    });
    if (result.count !== 1) {
      fail(`local verification fixture expected one user for ${email}, updated ${result.count}`);
    }
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

const extraHTTPHeaders = isHttpsOrigin && bypass
  ? {
      "x-vercel-protection-bypass": bypass,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: baseUrl,
  extraHTTPHeaders,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const pageErrors = [];
let registerRequest = null;
let registerResponse = null;
let registerRequestFailure = null;

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
  console.error(`PAGE_ERROR: ${error.message}`);
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

try {
  console.log(`E2E auth/navigation against ${baseUrl}`);

  // Password reset does not depend on registration. Prove the issue #265 path first
  // so a separate registration-navigation flake cannot hide reset latency evidence.
  await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
  await expectVisible(page.getByRole("heading", { name: "Återställ ditt lösenord" }), "forgot-password heading");
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
    let publicError = {};
    try {
      publicError = await observedRegisterResponse.json();
    } catch {
      publicError = {};
    }
    const errorCode = typeof publicError?.errorCode === "string" ? publicError.errorCode : "UNKNOWN";
    const errorMessage = typeof publicError?.error === "string" ? publicError.error : "unknown public error";
    fail(`register request returned HTTP ${observedRegisterResponse.status()} after ${registerLatencyMs}ms (${errorCode}: ${errorMessage})`);
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
  console.log("email verification resend: neutral browser flow passed");

  if (isAllowedLocalOrigin) {
    // The isolated local fallback owns its Postgres fixture, so it can mark the
    // just-created account verified strictly to continue the dashboard/navigation
    // smoke suite. Verification-token semantics themselves are covered by route
    // tests; no production or Preview database is ever mutated by this fixture.
    await markLocalAccountVerified();
    await page.getByRole("button", { name: "Logga in" }).click();
    await expectPath(page, "/dashboard");
    await expectVisible(page.getByRole("link", { name: "Fastigheter", exact: true }), "Fastigheter navigation");
    console.log("verified login: local isolated browser flow passed");

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
    console.log("critical desktop navigation: passed");

    // Command Center must be the single global search surface.
    await page.keyboard.press("Control+K");
    const commandCenter = page.getByRole("dialog", { name: "Revalta Command Center" });
    await expectVisible(commandCenter, "Command Center dialog");
    await expectVisible(commandCenter.getByText("Navigera", { exact: true }), "Command Center navigation section");
    const commandInput = commandCenter.getByLabel("Sök i Revalta eller välj kommando");
    await commandInput.fill(`missing-${runId}`);
    await expectVisible(commandCenter.getByText(/Inga träffar för/i), "Command Center empty search state");
    await page.getByRole("button", { name: "Stäng Command Center" }).click();
    console.log("global search / Command Center: passed");

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
    console.log("mobile navigation + Command Center: passed");

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
    console.log("logout + protected dashboard redirect: passed");
  } else {
    console.log(
      "Preview mode: verification gate and resend were exercised, but dashboard continuation is skipped because the runner has no trusted Preview mailbox/DB fixture.",
    );
  }

  if (pageErrors.length > 0) {
    fail(`browser emitted page errors: ${pageErrors.join(" | ")}`);
  }

  console.log("OK: browser auth/navigation E2E passed");
} finally {
  await context.close();
  await browser.close();
}
