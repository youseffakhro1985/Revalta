// Validators for the staff golden path. Failures are diagnostic only — never
// include response bodies, credentials, cookies or tenant identifiers.

function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateCreatedProperty(status, body) {
  if (status !== 201 || !hasId(body?.property?.id)) {
    throw new Error("Property create did not persist");
  }
}

export function validateCreatedTicket(status, body, propertyId) {
  if (
    status !== 201
    || !hasId(body?.ticket?.id)
    || body.ticket.property?.id !== propertyId
  ) {
    throw new Error("Ticket create did not persist on the created property");
  }
}

export function validateTicketStatus(status, body, expectedStatus, propertyId) {
  if (
    status !== 200
    || body?.ticket?.status !== expectedStatus
    || body.ticket.property?.id !== propertyId
  ) {
    throw new Error("Ticket did not reach the expected synced status");
  }
}

export function validateWorkOrderFromTicket(status, body, created) {
  if (!hasId(body?.workOrderId)) {
    throw new Error(`Ticket did not resolve to a work order (${status})`);
  }
  if (created && status !== 201) {
    throw new Error(`Work order create from ticket did not return 201 (${status})`);
  }
}

export function validateWorkOrderStatus(status, body, expectedStatus, ticketId) {
  const workOrder = body?.workOrder;
  if (
    status !== 200
    || workOrder?.status !== expectedStatus
    || workOrder?.ticket?.id !== ticketId
  ) {
    throw new Error("Work order did not reach the expected lifecycle status");
  }
}

export function validateTimeEntryCreated(status, body) {
  if (status !== 201 || !hasId(body?.entry?.entryId) || body.entry.status !== "submitted") {
    throw new Error("Time entry create did not persist as submitted");
  }
}

export function validateTimeEntryApproved(status, body) {
  if (status !== 201 || body?.entry?.status !== "approved") {
    throw new Error("Time entry was not attested");
  }
}

export function validateMaterialCreated(status, body) {
  if (status !== 201 || !hasId(body?.material?.entryId) || body.material.status !== "submitted") {
    throw new Error("Material entry create did not persist as submitted");
  }
}

export function validateMaterialApproved(status, body) {
  if (status !== 201 || body?.material?.status !== "approved") {
    throw new Error("Material entry was not attested");
  }
}

export function validateWorkOrderComment(status, body) {
  if (status !== 201 || !hasId(body?.comment?.id)) {
    throw new Error("Work-order comment did not persist");
  }
}

export function validateInvoiceDraftRebuilt(status, body) {
  if (status !== 201 || body?.draft?.status !== "draft" || !Array.isArray(body.draft.lines) || body.draft.lines.length < 1) {
    throw new Error("Invoice basis was not rebuilt from attested rows");
  }
}

export function validateInvoiceDraftReady(status, body) {
  if (status !== 201 || body?.draft?.status !== "ready") {
    throw new Error("Invoice basis was not marked ready");
  }
}

export function validateUnauthenticatedTicket(status) {
  if (status !== 401) {
    throw new Error("Staff ticket remained readable after logout");
  }
}

export function validateForbiddenReplay(status) {
  if (status !== 409) {
    throw new Error("Invoiced work order accepted an illegal in_progress transition");
  }
}

export function validateWorkOrderAuditHistory(status, body) {
  if (status !== 200 || !Array.isArray(body?.history) || body.history.length < 1) {
    throw new Error("Work-order audit history was empty after golden-path mutations");
  }
}
