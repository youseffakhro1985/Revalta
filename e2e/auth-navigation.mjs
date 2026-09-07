#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { validateTarget, validateRelease } from "./target-policy.mjs";

const target = validateTarget(process.env);
const { baseUrl, isLocal: isAllowedLocalOrigin } = target;
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
const RESET_MAX_LATENCY_MS = 8_000;
const RESET_NEUTRAL_MESSAGE = "Om kontot finns skickar vi en återställningslänk.";
const VERIFY_RESEND_NEUTRAL_MESSAGE = "Om kontot behöver verifieras skickar vi en ny verifieringslänk.";
const REGISTER_MAX_LATENCY_MS = 8_000;
const REGISTER_REQUEST_EMIT_TIMEOUT_MS = 5_000;
const REGISTER_DIAGNOSTIC_TIMEOUT_MS = 20_000;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = isAllowedLocalOrigin ? `e2e-owner-${runId}@example.com` : process.env.E2E_VERIFIED_EMAIL;
const password = isAllowedLocalOrigin ? `RevaltaE2E!${runId.slice(-8)}9` : process.env.E2E_VERIFIED_PASSWORD;
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

const bypassHeaders = !isAllowedLocalOrigin && bypass
  ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" }
  : {};
// Refuse redirects: a protection token must only reach the verified origin.
const healthResponse = await fetch(`${baseUrl}/api/health`, { headers: bypassHeaders, redirect: "error", signal: AbortSignal.timeout(15_000) });
if (!healthResponse.ok) fail(`Candidate health returned HTTP ${healthResponse.status}`);
validateRelease(await healthResponse.json(), target);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: baseUrl,
  viewport: { width: 1440, height: 1000 },
});
// Vercel's response cookie is confined to this host. Context-wide bypass
// headers can leak to subresources or redirected requests on other origins.
const protectionCookies = healthResponse.headers.getSetCookie().map((header) => {
  const pair = header.split(";", 1)[0];
  const separator = pair.indexOf("=");
  if (separator <= 0) fail("Invalid protection cookie response");
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl, httpOnly: true, secure: !isAllowedLocalOrigin, sameSite: "Lax" };
});
if (protectionCookies.length) await context.addCookies(protectionCookies);
const page = await context.newPage();
const pageErrors = [];
const failedRequests = [];
page.on("requestfailed", (request) => {
  if (new URL(request.url()).origin === baseUrl && request.failure()?.errorText !== "net::ERR_ABORTED") failedRequests.push(new URL(request.url()).pathname);
});
page.on("response", (response) => {
  if (new URL(response.url()).origin === baseUrl && response.status() >= 500) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`);
});
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

  if (isAllowedLocalOrigin) {
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

  } else {
    // Remote tests use an owner-provided, verified account in isolated test data.
    // Never synthesize accounts or change Preview/Production verification state.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.getByRole("heading", { name: "Välkommen tillbaka" }), "Preview login heading");
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Lösenord").fill(password);
  }
  if (isAllowedLocalOrigin) {
    // The isolated local fallback owns its Postgres fixture, so it can mark the
    // just-created account verified strictly to continue the dashboard/navigation
    // smoke suite. Verification-token semantics themselves are covered by route
    // tests; no production or Preview database is ever mutated by this fixture.
    await markLocalAccountVerified();
  }
    await page.getByRole("button", { name: "Logga in" }).click();
    await expectPath(page, "/dashboard");
    await expectVisible(page.getByRole("link", { name: "Fastigheter", exact: true }), "Fastigheter navigation");
    console.log("verified login: browser flow passed");

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

    // Record narrow responsive coverage for dashboard navigation, not all modules.
    for (const width of [360, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflows) fail(`Dashboard overflows the viewport at ${width}px`);
      await expectVisible(page.getByRole("button", { name: width < 1024 ? "Öppna Revalta Command Center" : "Sök eller kör kommando" }), `Command Center at ${width}px`);
    }

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

  if (pageErrors.length > 0) {
    fail(`browser emitted page errors: ${pageErrors.join(" | ")}`);
  }

  if (failedRequests.length) fail(`Application requests failed: ${failedRequests.join(" | ")}`);
  console.log(`OK: ${isAllowedLocalOrigin ? "local isolated diagnostic" : "exact Preview"} auth/navigation passed for ${target.expectedSha}; widths=360,390,768,1024,1280,1440. Provider email and golden-path mutations remain separate gates.`);
} finally {
  await context.close();
  await browser.close();
}
