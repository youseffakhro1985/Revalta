import { validateLoginResponse } from "./verification-contract.mjs";
import {
  validateAdminAssignQueueReadable,
  validateAdminAuditReadable,
  validateAdminCreated,
  validateAdminForbidden,
  validateAdminForceRelease,
  validateAdminInvoiceManageable,
  validateAdminLockAcquired,
  validateAdminLockBoardForceRelease,
  validateAdminOperationsReadable,
  validateAdminProfile,
  validateAdminPropertyCreateAllowed,
  validateAdminWorkOrderWritable,
  validateAdminCompanyManageable,
  validateAdminBillingReadable,
  validateAdminIntegrationsReadable,
  validateAdminOnboardingEligible,
} from "./admin-role-contract.mjs";

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
 * Owner-created admin on Preview: team/audit/force-release allowed,
 * cannot mint another owner, work-order/finance writable, #ekonomi visible.
 */
export async function runAdminRolePreview({
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
  const email = `e2e-admin-${runId}@example.com`;
  const password = `RevaltaAdm!${runId.slice(-8)}9`;
  const created = await api(ownerPage, "POST", "/api/team", {
    name: `E2E Admin ${runId.slice(-6)}`,
    email,
    role: "admin",
    password,
  });
  validateAdminCreated(created.status, created.body);

  const context = await browser.newContext({
    baseURL: baseUrl,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated admin login form");
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
    validateAdminProfile(profile.status, profile.body, companyId);

    const propertyList = await api(page, "GET", "/api/properties");
    validateAdminPropertyCreateAllowed(propertyList.status, propertyList.body);

    const grantOwner = await api(page, "POST", "/api/team", {
      name: "E2E blockerad ägare",
      email: `e2e-admin-owner-${runId}@example.com`,
      role: "owner",
      password: `RevaltaBlock!${runId.slice(-8)}9`,
    });
    validateAdminForbidden(grantOwner.status, grantOwner.body, "Grant owner role");

    const audit = await api(page, "GET", "/api/audit");
    validateAdminAuditReadable(audit.status, audit.body);

    const companySettings = await api(page, "GET", "/api/settings/company");
    validateAdminCompanyManageable(companySettings.status, companySettings.body, companyId);
    const billing = await api(page, "GET", "/api/billing");
    validateAdminBillingReadable(billing.status, billing.body);
    const integrations = await api(page, "GET", "/api/integrations");
    validateAdminIntegrationsReadable(integrations.status, integrations.body);
    const onboarding = await api(page, "GET", "/api/onboarding");
    validateAdminOnboardingEligible(onboarding.status, onboarding.body);

    const recurring = await api(page, "GET", "/api/work-orders/recurring");
    validateAdminOperationsReadable(recurring.status, recurring.body);
    const assignQueue = await api(page, "GET", "/api/work-orders/unassigned-queue");
    validateAdminAssignQueueReadable(assignQueue.status, assignQueue.body);

    const visible = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateAdminWorkOrderWritable(visible.status, visible.body, workOrderId);

    const lockBoard = await api(page, "GET", "/api/work-orders/edit-locks");
    validateAdminLockBoardForceRelease(lockBoard.status, lockBoard.body);

    let acquired = { status: 0, body: null };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const cleared = await api(page, "DELETE", "/api/work-orders/edit-locks", {
        workOrderId,
        reason: "E2E admin frigör kvarvarande UI-lås före egen redigering.",
      });
      validateAdminForceRelease(cleared.status, cleared.body);
      acquired = await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "acquire" });
      if (acquired.status !== 423) break;
      await page.waitForTimeout(400 * (attempt + 1));
    }
    const token = validateAdminLockAcquired(acquired.status, acquired.body);
    await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "release", token });

    const invoice = await api(page, "GET", `/api/work-orders/${workOrderId}/invoice-basis`);
    validateAdminInvoiceManageable(invoice.status, invoice.body);

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
    await expectVisible(page.locator("#work-order-title"), "admin work-order title");
    await page.waitForFunction(() => Boolean(document.getElementById("ekonomi")), null, { timeout: 15_000 }).catch(() => {
      fail("Admin finance panel was hidden");
    });
    await expectVisible(
      page.getByRole("button", { name: /Spara låst och validerad ändring|Väntar på redigeringslås/ }),
      "admin work-order save lock",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#work-order-title").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#work-order-title"), "admin mobile work-order title");
    await page.locator("#ekonomi").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#ekonomi"), "admin mobile finance panel");
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectPath(page, "/dashboard");
  } finally {
    await context.close();
  }
}
