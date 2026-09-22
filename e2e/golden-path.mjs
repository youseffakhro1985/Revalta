import {
  validateCreatedProperty,
  validateCreatedTicket,
  validateForbiddenReplay,
  validateInvoiceDraftReady,
  validateInvoiceDraftReadyState,
  validateInvoiceDraftRebuilt,
  validateLockedStatusChange,
  validateMaterialApproved,
  validateMaterialCreated,
  validateTicketStatus,
  validateTimeEntryApproved,
  validateTimeEntryCreated,
  validateUnauthenticatedTicket,
  validateWorkOrderAuditHistory,
  validateWorkOrderComment,
  validateWorkOrderFromTicket,
  validateWorkOrderLockAcquired,
  validateWorkOrderStatus,
} from "./golden-path-contract.mjs";

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function lockVersion(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

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

async function acquireLock(page, workOrderId) {
  const acquired = await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "acquire" });
  return validateWorkOrderLockAcquired(acquired.status, acquired.body);
}

async function releaseLock(page, workOrderId, token) {
  await api(page, "POST", `/api/work-orders/${workOrderId}/edit-lock`, { action: "release", token });
}

async function patchWorkOrderStatus(page, workOrderId, status, lock) {
  const result = await api(page, "PATCH", `/api/work-orders/${workOrderId}/locked-update`, {
    status,
    editToken: lock.token,
    version: lock.version,
  });
  const nextVersion = lockVersion(result.body?.workOrder?.updated_at);
  return {
    result,
    lock: nextVersion ? { token: lock.token, version: nextVersion } : lock,
  };
}

/**
 * Staff golden path A: property → ticket → work order → time/material/attest
 * → completed → invoice basis → invoiced, plus UI on desktop and mobile.
 * Mutations go through page.fetch so Preview assertRelease still gates them.
 */
export async function runStaffGoldenPath({
  page,
  expectVisible,
  expectPath,
  runId,
  staffUserId,
}) {
  const suffix = runId.slice(-6);
  const propertyName = `E2E Fastighet ${suffix}`;
  const ticketTitle = `E2E läcka ${suffix}`;

  const createdProperty = await api(page, "POST", "/api/properties", {
    name: propertyName,
    address: "Testgatan 1",
    city: "Stockholm",
  });
  validateCreatedProperty(createdProperty.status, createdProperty.body);
  const propertyId = createdProperty.body.property.id;

  const createdTicket = await api(page, "POST", "/api/tickets", {
    title: ticketTitle,
    description: "Dropp under diskbänk som ska följa golden path till fakturaunderlag.",
    propertyId,
    category: "other",
    priority: "high",
    assignedToId: staffUserId,
  });
  validateCreatedTicket(createdTicket.status, createdTicket.body, propertyId);
  const ticketId = createdTicket.body.ticket.id;

  const ticketAfterCreate = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateTicketStatus(ticketAfterCreate.status, ticketAfterCreate.body, "new", propertyId);

  const linked = await api(page, "POST", `/api/tickets/${ticketId}/work-order`, {});
  let probe;
  if (!linked.body?.workOrderId && !linked.body?.workOrder?.id) {
    const existingWorkOrder = await api(page, "GET", `/api/tickets/${ticketId}/work-order`);
    probe = {
      probed: true,
      existing: Boolean(existingWorkOrder?.body?.workOrder?.id),
      workOrderId: existingWorkOrder?.body?.workOrder?.id || "",
    };
  }
  const workOrderId = validateWorkOrderFromTicket(linked.status, linked.body, true, probe);

  const planned = await api(page, "GET", `/api/work-orders/${workOrderId}`);
  validateWorkOrderStatus(planned.status, planned.body, "planned", ticketId);

  const receivedTicket = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateTicketStatus(receivedTicket.status, receivedTicket.body, "received", propertyId);

  let lock = await acquireLock(page, workOrderId);
  const started = await patchWorkOrderStatus(page, workOrderId, "in_progress", lock);
  validateLockedStatusChange(started.result.status, started.result.body, "in_progress");
  lock = started.lock;

  const inProgressOrder = await api(page, "GET", `/api/work-orders/${workOrderId}`);
  validateWorkOrderStatus(inProgressOrder.status, inProgressOrder.body, "in_progress", ticketId);
  const inProgressTicket = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateTicketStatus(inProgressTicket.status, inProgressTicket.body, "in_progress", propertyId);

  const timeCreated = await api(page, "POST", `/api/work-orders/${workOrderId}/time-entries`, {
    action: "manual",
    kind: "work",
    startedAt: hoursAgo(2),
    endedAt: hoursAgo(1),
    billable: true,
    note: "Golden-path arbete",
  });
  validateTimeEntryCreated(timeCreated.status, timeCreated.body);
  const timeApproved = await api(page, "POST", `/api/work-orders/${workOrderId}/time-entries`, {
    action: "approve",
    entryId: timeCreated.body.entry.entryId,
  });
  validateTimeEntryApproved(timeApproved.status, timeApproved.body);

  const materialCreated = await api(page, "POST", `/api/work-orders/${workOrderId}/materials`, {
    action: "create",
    name: "Packning",
    quantity: 1,
    unitPrice: 85,
    unit: "st",
    stockStatus: "used",
    billable: true,
  });
  validateMaterialCreated(materialCreated.status, materialCreated.body);
  const materialApproved = await api(page, "POST", `/api/work-orders/${workOrderId}/materials`, {
    action: "approve",
    entryId: materialCreated.body.material.entryId,
  });
  validateMaterialApproved(materialApproved.status, materialApproved.body);

  const commented = await api(page, "POST", `/api/work-orders/${workOrderId}/comments`, {
    body: "Åtgärd utförd enligt golden path.",
    isInternal: true,
  });
  validateWorkOrderComment(commented.status, commented.body);

  await releaseLock(page, workOrderId, lock.token);

  await page.goto(`/dashboard/felanmalan/${ticketId}`, { waitUntil: "domcontentloaded" });
  await expectPath(page, `/dashboard/felanmalan/${ticketId}`);
  await expectVisible(page.getByRole("heading", { name: ticketTitle }), "ticket detail title");

  await page.goto(`/dashboard/arbetsorder/${workOrderId}`, { waitUntil: "domcontentloaded" });
  await expectPath(page, `/dashboard/arbetsorder/${workOrderId}`);
  await expectVisible(page.getByRole("heading", { name: ticketTitle, level: 1 }), "work-order detail title");
  await expectVisible(page.getByText("Planerad → Påbörjad").first(), "in_progress status history");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTitle = page.locator("#work-order-title");
  await mobileTitle.scrollIntoViewIfNeeded();
  await expectVisible(mobileTitle, "mobile work-order title");
  const mobileMaterial = page.locator("#work-order-execution-material");
  await mobileMaterial.scrollIntoViewIfNeeded();
  await expectVisible(mobileMaterial, "mobile execution material");
  await page.setViewportSize({ width: 1440, height: 1000 });

  lock = await acquireLock(page, workOrderId);
  const completed = await patchWorkOrderStatus(page, workOrderId, "completed", lock);
  validateLockedStatusChange(completed.result.status, completed.result.body, "completed");
  lock = completed.lock;
  const completedTicket = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateTicketStatus(completedTicket.status, completedTicket.body, "completed", propertyId);

  const rebuilt = await api(page, "POST", `/api/work-orders/${workOrderId}/invoice-basis`, { action: "rebuild" });
  validateInvoiceDraftRebuilt(rebuilt.status, rebuilt.body);
  const ready = await api(page, "POST", `/api/work-orders/${workOrderId}/invoice-basis`, {
    action: "markReady",
    customerName: "E2E hyresgäst",
  });
  validateInvoiceDraftReady(ready.status, ready.body);
  const readyState = await api(page, "GET", `/api/work-orders/${workOrderId}/invoice-basis`);
  validateInvoiceDraftReadyState(readyState.status, readyState.body);

  lock = await acquireLock(page, workOrderId);
  const invoiced = await patchWorkOrderStatus(page, workOrderId, "invoiced", lock);
  validateLockedStatusChange(invoiced.result.status, invoiced.result.body, "invoiced");
  lock = invoiced.lock;
  const closedTicket = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateTicketStatus(closedTicket.status, closedTicket.body, "closed", propertyId);

  const forbiddenReplay = await patchWorkOrderStatus(page, workOrderId, "in_progress", lock);
  validateForbiddenReplay(forbiddenReplay.result.status, forbiddenReplay.result.body);

  const history = await api(page, "GET", `/api/work-orders/${workOrderId}/comments`);
  validateWorkOrderAuditHistory(history.status, history.body);

  await releaseLock(page, workOrderId, lock.token);

  return { ticketId, workOrderId, propertyId };
}

export async function assertTicketHiddenAfterLogout(page, ticketId) {
  const response = await api(page, "GET", `/api/tickets/${ticketId}`);
  validateUnauthenticatedTicket(response.status);
}
