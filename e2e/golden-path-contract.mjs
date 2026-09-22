// Validators for the staff golden path. Failures are diagnostic only — never
// include response bodies, credentials, cookies or tenant identifiers.

function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateCreatedProperty(status, body) {
  if (status !== 201 || !hasId(body?.property?.id)) {
    throw new Error(`Property create did not persist (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateCreatedTicket(status, body, propertyId) {
  if (
    status !== 201
    || !hasId(body?.ticket?.id)
    || body.ticket.property?.id !== propertyId
  ) {
    throw new Error(`Ticket create did not persist on the created property (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateTicketStatus(status, body, expectedStatus, propertyId) {
  if (
    status !== 200
    || body?.ticket?.status !== expectedStatus
    || body.ticket.property?.id !== propertyId
  ) {
    throw new Error(`Ticket did not reach the expected synced status (${diagnosticStatusShape(status, body)})`);
  }
}

export function allowlistedApiErrorCode(value) {
  const allowed = new Set([
    "SERVICE_UNAVAILABLE",
    "INTERNAL_ERROR",
    "NOT_FOUND",
    "CONFLICT",
    "VALIDATION_FAILED",
    "FORBIDDEN",
    "UNAUTHORIZED",
  ]);
  return typeof value === "string" && allowed.has(value) ? value : "none";
}

export function allowlistedWorkOrderCreateErrorCode(value) {
  return allowlistedApiErrorCode(value);
}

export function diagnosticStatusShape(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  return `${status}:${allowlistedApiErrorCode(body?.errorCode)}`;
}

export function resolveWorkOrderIdFromCreate(body, probe) {
  if (hasId(body?.workOrderId)) return body.workOrderId;
  if (hasId(body?.workOrder?.id)) return body.workOrder.id;
  if (hasId(probe?.workOrderId)) return probe.workOrderId;
  return "";
}

export function validateWorkOrderFromTicket(status, body, created, probe) {
  const resolvedId = resolveWorkOrderIdFromCreate(body, probe);
  if (hasId(resolvedId)) {
    const fromCreateEnvelope = hasId(body?.workOrderId);
    if (created && fromCreateEnvelope && status !== 201 && status !== 200) {
      throw new Error(`Work order create from ticket did not return 201 (${status})`);
    }
    return resolvedId;
  }
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  const getPayload = Boolean(
    body
    && typeof body === "object"
    && ("workOrder" in body || "canCreate" in body || "suggestedAssignedToId" in body),
  );
  const code = allowlistedApiErrorCode(body?.errorCode);
  const shape = redirected ? "redirect" : getPayload ? "get_payload" : code;
  const existing = probe?.probed
    ? (probe.existing ? "yes" : "no")
    : "unchecked";
  throw new Error(`Ticket did not resolve to a work order (${status}:${shape};existing=${existing})`);
}

export function validateWorkOrderStatus(status, body, expectedStatus, ticketId) {
  const workOrder = body?.workOrder;
  if (
    status !== 200
    || workOrder?.status !== expectedStatus
    || workOrder?.ticket?.id !== ticketId
  ) {
    throw new Error(`Work order did not reach the expected lifecycle status (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateWorkOrderLockAcquired(status, body) {
  const token = body?.lock?.token;
  const version = body?.lock?.version;
  if (status !== 201 || !hasId(token) || !hasId(version)) {
    throw new Error(`Work-order edit lock was not acquired (${diagnosticStatusShape(status, body)})`);
  }
  return { token, version };
}

export function validateLockedStatusChange(status, body, expectedStatus) {
  if (status !== 200 || body?.workOrder?.status !== expectedStatus) {
    throw new Error(`Work order did not enter ${expectedStatus} (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateTimeEntryCreated(status, body) {
  if (status !== 201 || !hasId(body?.entry?.entryId) || body.entry.status !== "submitted") {
    throw new Error(`Time entry create did not persist as submitted (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateTimeEntryApproved(status, body) {
  if (status !== 201 || body?.entry?.status !== "approved") {
    throw new Error(`Time entry was not attested (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateMaterialCreated(status, body) {
  if (status !== 201 || !hasId(body?.material?.entryId) || body.material.status !== "submitted") {
    throw new Error(`Material entry create did not persist as submitted (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateMaterialApproved(status, body) {
  if (status !== 201 || body?.material?.status !== "approved") {
    throw new Error(`Material entry was not attested (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateWorkOrderComment(status, body) {
  if (status !== 201 || !hasId(body?.comment?.id)) {
    throw new Error(`Work-order comment did not persist (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateInvoiceDraftRebuilt(status, body) {
  if (status !== 201 || body?.draft?.status !== "draft" || !Array.isArray(body.draft.lines) || body.draft.lines.length < 1) {
    throw new Error(`Invoice basis was not rebuilt from attested rows (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateInvoiceDraftReady(status, body) {
  if (status !== 201 || body?.draft?.status !== "ready") {
    throw new Error(`Invoice basis was not marked ready (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateUnauthenticatedTicket(status) {
  if (status !== 401) {
    throw new Error("Staff ticket remained readable after logout");
  }
}

export function validateForbiddenReplay(status, body) {
  if (status !== 409) {
    throw new Error(`Invoiced work order accepted an illegal in_progress transition (${diagnosticStatusShape(status, body)})`);
  }
}

export function validateWorkOrderAuditHistory(status, body) {
  if (status !== 200 || !Array.isArray(body?.history) || body.history.length < 1) {
    throw new Error(`Work-order audit history was empty after golden-path mutations (${diagnosticStatusShape(status, body)})`);
  }
}
