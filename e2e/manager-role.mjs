import { validateLoginResponse } from "./verification-contract.mjs";
import {
  validateManagerAssignQueueReadable,
  validateManagerCreated,
  validateManagerForbidden,
  validateManagerInvoiceManageable,
  validateManagerLockAcquired,
  validateManagerOperationsReadable,
  validateManagerProfile,
  validateManagerPropertyCreateAllowed,
  validateManagerWorkOrderWritable,
} from "./manager-role-contract.mjs";

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
 * Owner-created manager on Preview: operations and assign queues readable,
 * work-order/finance writable, team/audit still 403, #ekonomi visible.
 */
export async function runManagerRolePreview({
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
  const email = `e2e-manager-${runId}@example.com`;
  const password = `RevaltaMgr!${runId.slice(-8)}9`;
  const created = await api(ownerPage, "POST", "/api/team", {
    name: `E2E Förvaltare ${runId.slice(-6)}`,
    email,
    role: "manager",
    password,
  });
  validateManagerCreated(created.status, created.body);

  const context = await browser.newContext({
    baseURL: baseUrl,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated manager login form");
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
    validateManagerProfile(profile.status, profile.body, companyId);

    const propertyList = await api(page, "GET", "/api/properties");
    validateManagerPropertyCreateAllowed(propertyList.status, propertyList.body);

    const teamCreate = await api(page, "POST", "/api/team", {
      name: "E2E manager-blockerad",
      email: `e2e-manager-blocked-${runId}@example.com`,
      role: "technician",
      password: `RevaltaBlock!${runId.slice(-8)}9`,
    });
    validateManagerForbidden(teamCreate.status, teamCreate.body, "Team create");

    const audit = await api(page, "GET", "/api/audit");
    validateManagerForbidden(audit.status, audit.body, "Audit log");

    const recurring = await api(page, "GET", "/api/work-orders/recurring");
    validateManagerOperationsReadable(recurring.status, recurring.body);
    const assignQueue = await api(page, "GET", "/api/work-orders/unassigned-queue");
    validateManagerAssignQueueReadable(assignQueue.status, assignQueue.body);

    const visible = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateManagerWorkOrderWritable(visible.status, visible.body, workOrderId);

    const acquired = await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "acquire" });
    const token = validateManagerLockAcquired(acquired.status, acquired.body);
    await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "release", token });

    const invoice = await api(page, "GET", `/api/work-orders/${workOrderId}/invoice-basis`);
    validateManagerInvoiceManageable(invoice.status, invoice.body);

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
    await expectVisible(page.locator("#work-order-title"), "manager work-order title");
    await page.waitForFunction(() => Boolean(document.getElementById("ekonomi")), null, { timeout: 15_000 }).catch(() => {
      fail("Manager finance panel was hidden");
    });
    await expectVisible(
      page.getByRole("button", { name: /Spara låst och validerad ändring|Väntar på redigeringslås/ }),
      "manager work-order save lock",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#work-order-title").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#work-order-title"), "manager mobile work-order title");
    await page.locator("#ekonomi").scrollIntoViewIfNeeded();
    await expectVisible(page.locator("#ekonomi"), "manager mobile finance panel");
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectPath(page, "/dashboard");
  } finally {
    await context.close();
  }
}
