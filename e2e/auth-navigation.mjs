#!/usr/bin/env node
import { chromium } from "playwright";

const baseUrl = String(process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();

if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
  console.error("E2E_BASE_URL must be an https Preview origin");
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

async function expectPath(page, pathname) {
  await page.waitForURL((url) => url.pathname === pathname || url.pathname.startsWith(`${pathname}/`), { timeout: 20_000 });
}

const extraHTTPHeaders = bypass
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

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
  console.error(`PAGE_ERROR: ${error.message}`);
});

try {
  console.log(`E2E auth/navigation against ${baseUrl}`);

  // Register through the real browser form.
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await expectVisible(page.getByRole("heading", { name: "Skapa ditt Revalta-konto" }), "register heading");
  await page.getByLabel("Namn").fill("Revalta E2E Owner");
  await page.getByLabel("Organisation").fill(companyName);
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(password);
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await expectPath(page, "/login");
  console.log("register: browser flow passed");

  // Password-reset browser coverage is intentionally isolated in issue #265
  // until Preview request latency is bounded and deterministic.

  // Login through the real form.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expectPath(page, "/dashboard");
  await expectVisible(page.getByRole("link", { name: "Fastigheter", exact: true }), "Fastigheter navigation");
  console.log("login: browser flow passed");

  // Desktop critical navigation: compact IA + expandable Drift.
  await expectVisible(page.getByRole("link", { name: "Översikt", exact: true }), "Översikt navigation");
  await expectVisible(page.getByRole("button", { name: "Drift" }), "Drift navigation group");
  await page.getByRole("button", { name: "Drift" }).click();
  await expectVisible(page.getByRole("link", { name: "Ärenden", exact: true }), "Ärenden navigation");
  await expectVisible(page.getByRole("link", { name: "Arbetsordrar", exact: true }), "Arbetsordrar navigation");
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

  // Mobile menu must expose the same navigation model.
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
  console.log("mobile menu: passed");

  // Logout and verify the protected dashboard is no longer the active surface.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const logout = page.getByRole("button", { name: "Logga ut" }).first();
  await expectVisible(logout, "logout button");
  await logout.click();
  await expectPath(page, "/login");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expectPath(page, "/login");
  console.log("logout + protected dashboard redirect: passed");

  if (pageErrors.length > 0) {
    fail(`browser emitted page errors: ${pageErrors.join(" | ")}`);
  }

  console.log("OK: browser auth/navigation E2E passed");
} finally {
  await context.close();
  await browser.close();
}
