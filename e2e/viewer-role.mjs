import { validateLoginResponse } from "./verification-contract.mjs";
import {
  validateViewerCompanyReadOnly,
  validateViewerCreated,
  validateViewerForbidden,
  validateViewerInvoiceReadable,
  validateViewerOnboardingIneligible,
  validateViewerProfile,
  validateViewerPropertyCreateDenied,
  validateViewerWorkOrderReadable,
} from "./viewer-role-contract.mjs";

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      redirect: "manual",
      headers: body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { status: response.status || 0, body: null };
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, body: json };
  }, { method, path, body });
}

async function attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail }) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const sameOrigin = new URL(request.url()).origin === baseUrl;
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method());
    try {
      if (mutation) {
        if (!sameOrigin) fail("Cross-origin mutation is not allowed in release verification");
        await assertRelease();
      }
      await route.continue({
        headers: {
          ...request.headers(),
          ...(sameOrigin && bypass ? { "x-vercel-protection-bypass": bypass } : {}),
        },
      });
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

/**
 * Owner-created viewer on Preview: company-wide WO read, finance read,
 * no mutations, operations/admin 403s, #ekonomi visible, lock forms hidden.
 */
export async function runViewerRolePreview({
  browser,
  ownerPage,
  baseUrl,
  bypass,
  assertRelease,
  fail,
  expectVisible,
  expectPath,
  runId,
  workOrderId,
  companyId,
}) {
  const email = `e2e-viewer-${runId}@example.com`;
  const password = `RevaltaView!${runId.slice(-8)}9`;
  const created = await api(ownerPage, "POST", "/api/team", {
    name: `E2E Granskare ${runId.slice(-6)}`,
    email,
    role: "viewer",
    password,
  });
  validateViewerCreated(created.status, created.body);

  const context = await browser.newContext({
    baseURL: baseUrl,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated viewer login form");
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Lösenord").fill(password);
    const loginPromise = page.waitForResponse((response) => {
      try {
        return new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST";
      } catch {
        return false;
      }
    }, { timeout: 45_000 });
    await page.getByRole("button", { name: "Logga in" }).click();
    const login = await loginPromise;
    validateLoginResponse(login.status(), await login.json(), email);
    await expectPath(page, "/dashboard");

    const profile = await api(page, "GET", "/api/settings/profile");
    validateViewerProfile(profile.status, profile.body, companyId);

    const propertyList = await api(page, "GET", "/api/properties");
    validateViewerPropertyCreateDenied(propertyList.status, propertyList.body);
    const propertyCreate = await api(page, "POST", "/api/properties", {
      name: `Viewer-blockerad ${runId.slice(-6)}`,
      address: "Testgatan 1",
      city: "Stockholm",
    });
    validateViewerForbidden(propertyCreate.status, propertyCreate.body, "Property create");

    const teamCreate = await api(page, "POST", "/api/team", {
      name: "E2E viewer-blockerad",
      email: `e2e-viewer-blocked-${runId}@example.com`,
      role: "technician",
      password: `RevaltaBlock!${runId.slice(-8)}9`,
    });
    validateViewerForbidden(teamCreate.status, teamCreate.body, "Team create");

    const audit = await api(page, "GET", "/api/audit");
    validateViewerForbidden(audit.status, audit.body, "Audit log");
    const companySettings = await api(page, "GET", "/api/settings/company");
    validateViewerCompanyReadOnly(companySettings.status, companySettings.body, companyId);
    const companyPatch = await api(page, "PATCH", "/api/settings/company", { name: "E2E blockerad org" });
    validateViewerForbidden(companyPatch.status, companyPatch.body, "Company settings patch");
    const billing = await api(page, "GET", "/api/billing");
    validateViewerForbidden(billing.status, billing.body, "Billing");
    const integrations = await api(page, "GET", "/api/integrations");
    validateViewerForbidden(integrations.status, integrations.body, "Integrations");
    const onboarding = await api(page, "GET", "/api/onboarding");
    validateViewerOnboardingIneligible(onboarding.status, onboarding.body);
    const onboardingWrite = await api(page, "POST", "/api/onboarding", { action: "verify-ticket-intake" });
    validateViewerForbidden(onboardingWrite.status, onboardingWrite.body, "Onboarding verify");
    const recurring = await api(page, "GET", "/api/work-orders/recurring");
    validateViewerForbidden(recurring.status, recurring.body, "Recurring schedules");
    const assignQueue = await api(page, "GET", "/api/work-orders/unassigned-queue");
    validateViewerForbidden(assignQueue.status, assignQueue.body, "Work-order assign queue");

    const visible = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateViewerWorkOrderReadable(visible.status, visible.body, workOrderId);

    const lock = await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "acquire" });
    validateViewerForbidden(lock.status, lock.body, "Work-order edit lock");

    const invoice = await api(page, "GET", `/api/work-orders/${workOrderId}/invoice-basis`);
    validateViewerInvoiceReadable(invoice.status, invoice.body);
    const rebuild = await api(page, "POST", `/api/work-orders/${workOrderId}/invoice-basis`, { action: "rebuild" });
    validateViewerForbidden(rebuild.status, rebuild.body, "Invoice basis rebuild");

    const workOrderLoaded = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return url.pathname === `/api/work-orders/${workOrderId}` && response.request().method() === "GET";
      } catch {
        return false;
      }
    }, { timeout: 20_000 });
    await page.goto(`/dashboard/arbetsorder/${workOrderId}`, { waitUntil: "domcontentloaded" });
    await workOrderLoaded;
    await expectPath(page, `/dashboard/arbetsorder/${workOrderId}`);
    await expectVisible(page.locator("#work-order-title"), "viewer work-order title");
    await page.waitForFunction(() => Boolean(document.getElementById("ekonomi")), null, { timeout: 15_000 }).catch(() => {
      fail("Viewer finance panel was hidden");
    });
    await expectVisible(
      page.getByText("Du har läsbehörighet men kan inte ändra arbetsordern."),
      "viewer read-only work-order controls",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#work-order-title").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#work-order-title"), "viewer mobile work-order title");
    await page.locator("#ekonomi").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#ekonomi"), "viewer mobile finance panel");
    await page.setViewportSize({ width: 1440, height: 1000 });
  } finally {
    await context.close();
  }
}
