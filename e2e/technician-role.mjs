import { validateLoginResponse } from "./verification-contract.mjs";
import { validateWorkOrderLockAcquired } from "./golden-path-contract.mjs";
import {
  validateAssignedWorkOrderVisible,
  validateTechnicianCalendarAssigned,
  validateTechnicianCalendarHidden,
  validateTechnicianCreated,
  validateTechnicianForbidden,
  validateTechnicianProfile,
  validateUnassignedWorkOrderHidden,
} from "./technician-role-contract.mjs";

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
 * Owner-created technician on Preview: hidden unassigned WO, document library
 * 403, bookings 403, assigned WO readable, invoicing 403.
 */
export async function runTechnicianRolePreview({
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
  const email = `e2e-tech-${runId}@example.com`;
  const password = `RevaltaTech!${runId.slice(-8)}9`;
  const created = await api(ownerPage, "POST", "/api/team", {
    name: `E2E Tekniker ${runId.slice(-6)}`,
    email,
    role: "technician",
    password,
  });
  const technicianId = validateTechnicianCreated(created.status, created.body);

  const context = await browser.newContext({
    baseURL: baseUrl,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated technician login form");
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
    validateTechnicianProfile(profile.status, profile.body, companyId);

    const hidden = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateUnassignedWorkOrderHidden(hidden.status, hidden.body);

    const library = await api(page, "GET", "/api/documents/library");
    validateTechnicianForbidden(library.status, library.body, "Document library");

    const bookings = await api(page, "POST", "/api/bookings", {
      propertyId: "00000000-0000-4000-8000-000000000000",
      resource: "E2E Tvätt",
      residentName: "E2E",
      start: "2027-03-01T10:00:00.000Z",
      end: "2027-03-01T11:00:00.000Z",
    });
    validateTechnicianForbidden(bookings.status, bookings.body, "Staff booking create");

    const calendarHidden = await api(page, "GET", "/api/calendar");
    validateTechnicianCalendarHidden(calendarHidden.status, calendarHidden.body, workOrderId);

    const acquired = await api(ownerPage, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "acquire" });
    const lock = validateWorkOrderLockAcquired(acquired.status, acquired.body);
    const assigned = await api(ownerPage, "PATCH", `/api/work-orders/${workOrderId}/locked-update`, {
      assignedToId: technicianId,
      scheduledStart: "2027-06-15T08:00:00.000Z",
      scheduledEnd: "2027-06-15T10:00:00.000Z",
      editToken: lock.token,
      version: lock.version,
    });
    if (assigned.status !== 200 || assigned.body?.workOrder?.assigned_to_id !== technicianId) {
      throw new Error("Owner could not assign the golden-path work order to the technician fixture");
    }
    await api(ownerPage, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "release", token: lock.token });

    const assignedOrder = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateAssignedWorkOrderVisible(assignedOrder.status, assignedOrder.body, workOrderId);

    const calendarAssigned = await api(page, "GET", "/api/calendar");
    validateTechnicianCalendarAssigned(calendarAssigned.status, calendarAssigned.body, workOrderId);

    const invoice = await api(page, "GET", `/api/work-orders/${workOrderId}/invoice-basis`);
    validateTechnicianForbidden(invoice.status, invoice.body, "Invoice basis");
  } finally {
    await context.close();
  }
}
