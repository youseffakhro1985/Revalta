import { validateLoginResponse } from "./verification-contract.mjs";
import {
  validateForeignLeaseHidden,
  validateMatchedLeaseVisible,
  validateResidentBookingCreated,
  validateResidentBookingOverlapRejected,
  validateResidentCreated,
  validateResidentForbidden,
  validateResidentLeaseCreated,
  validateResidentProfile,
  validateResidentTicketCreated,
  validateResidentTicketVisible,
  validateResidentUnitCreated,
} from "./resident-portal-contract.mjs";

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
 * Owner-created resident on Preview: matched lease, portal ticket, staff APIs
 * 403, foreign lease 404, and resident booking overlap 409.
 */
export async function runResidentPortalPreview({
  browser,
  ownerPage,
  baseUrl,
  bypass,
  assertRelease,
  fail,
  expectVisible,
  expectPath,
  runId,
  propertyId,
  workOrderId,
  companyId,
}) {
  const suffix = runId.slice(-6);
  const email = `e2e-resident-${runId}@example.com`;
  const password = `RevaltaBoende!${runId.slice(-8)}9`;

  const created = await api(ownerPage, "POST", "/api/team", {
    name: `E2E Boende ${suffix}`,
    email,
    role: "resident",
    password,
  });
  validateResidentCreated(created.status, created.body);

  const unit = await api(ownerPage, "POST", `/api/properties/${propertyId}/units`, {
    designation: `E2E ${suffix}`,
    unitType: "apartment",
  });
  const unitId = validateResidentUnitCreated(unit.status, unit.body);

  const lease = await api(ownerPage, "POST", "/api/leases", {
    unitId,
    holderName: `E2E Boende ${suffix}`,
    holderType: "individual",
    holderEmail: email,
    status: "active",
    startDate: "2026-01-15",
    monthlyRent: 8500,
    deposit: 0,
  });
  const leaseId = validateResidentLeaseCreated(lease.status, lease.body, propertyId);

  const context = await browser.newContext({
    baseURL: baseUrl,
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await attachReleaseGate(context, { baseUrl, bypass, assertRelease, fail });
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectVisible(page.locator("form#login-form[data-ready='1']"), "hydrated resident login form");
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
    await expectPath(page, "/dashboard/boendeportal");
    await expectVisible(page.getByRole("heading", { name: "Mina ärenden", level: 1 }), "resident portal title");

    const profile = await api(page, "GET", "/api/settings/profile");
    validateResidentProfile(profile.status, profile.body, companyId);

    const staffLeases = await api(page, "GET", "/api/leases");
    validateResidentForbidden(staffLeases.status, staffLeases.body, "Staff leases");

    const staffBookings = await api(page, "POST", "/api/bookings", {
      propertyId,
      resource: "E2E Tvätt",
      residentName: "E2E",
      start: "2027-04-01T10:00:00.000Z",
      end: "2027-04-01T11:00:00.000Z",
    });
    validateResidentForbidden(staffBookings.status, staffBookings.body, "Staff booking create");

    const hiddenWorkOrder = await api(page, "GET", `/api/work-orders/${workOrderId}`);
    validateResidentForbidden(hiddenWorkOrder.status, hiddenWorkOrder.body, "Staff work order");

    const workspace = await api(page, "GET", "/api/resident-portal");
    validateMatchedLeaseVisible(workspace.status, workspace.body, leaseId);

    const foreignTicket = await api(page, "POST", "/api/resident-portal", {
      leaseId: "00000000-0000-4000-8000-000000000000",
      subject: `E2E felanmälan ${suffix}`,
      message: "Dropp under diskbänk som ska följa boendegolden path.",
      category: "plumbing",
      priority: "normal",
    });
    validateForeignLeaseHidden(foreignTicket.status, foreignTicket.body);

    const createdTicket = await api(page, "POST", "/api/resident-portal", {
      leaseId,
      subject: `E2E felanmälan ${suffix}`,
      message: "Dropp under diskbänk som ska följa boendegolden path.",
      category: "plumbing",
      priority: "normal",
    });
    const ticketId = validateResidentTicketCreated(createdTicket.status, createdTicket.body);

    const portalTicket = await api(page, "GET", `/api/resident-portal/tickets/${ticketId}`);
    validateResidentTicketVisible(portalTicket.status, portalTicket.body, ticketId);

    const staffTicket = await api(page, "GET", `/api/tickets/${ticketId}`);
    validateResidentForbidden(staffTicket.status, staffTicket.body, "Staff ticket");

    const resource = `E2E Boendeförråd ${suffix}`;
    const first = await api(page, "POST", "/api/resident-portal/bookings", {
      leaseId,
      resource,
      start: "2027-05-01T10:00:00.000Z",
      end: "2027-05-01T11:00:00.000Z",
    });
    validateResidentBookingCreated(first.status, first.body);

    const overlap = await api(page, "POST", "/api/resident-portal/bookings", {
      leaseId,
      resource,
      start: "2027-05-01T10:30:00.000Z",
      end: "2027-05-01T11:30:00.000Z",
    });
    validateResidentBookingOverlapRejected(overlap.status, overlap.body);
  } finally {
    await context.close();
  }
}
