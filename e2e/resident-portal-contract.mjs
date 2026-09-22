function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

function diagnostic(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  const code = typeof body?.errorCode === "string" && /^[A-Z_]+$/.test(body.errorCode) ? body.errorCode : "none";
  return `${status}:${code}`;
}

export function validateResidentCreated(status, body) {
  if (status !== 201 || body?.member?.role !== "resident" || !hasId(body?.member?.id)) {
    throw new Error(`Resident fixture was not created (${diagnostic(status, body)})`);
  }
  return body.member.id;
}

export function validateResidentUnitCreated(status, body) {
  if (status !== 201 || !hasId(body?.unit?.id)) {
    throw new Error(`Resident unit was not created (${diagnostic(status, body)})`);
  }
  return body.unit.id;
}

export function validateResidentLeaseCreated(status, body, propertyId) {
  if (
    status !== 201
    || !hasId(body?.lease?.id)
    || body?.lease?.status !== "active"
    || body?.lease?.property_id !== propertyId
  ) {
    throw new Error(`Resident lease was not created (${diagnostic(status, body)})`);
  }
  return body.lease.id;
}

export function validateResidentProfile(status, body, companyId) {
  const user = body?.user;
  if (
    status !== 200
    || user?.role !== "resident"
    || user?.status !== "active"
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
  ) {
    throw new Error(`Resident profile was not a scoped self-service fixture (${diagnostic(status, body)})`);
  }
}

export function validateResidentForbidden(status, body, label) {
  if (status !== 403) {
    throw new Error(`${label} was not forbidden (${diagnostic(status, body)})`);
  }
}

export function validateMatchedLeaseVisible(status, body, leaseId) {
  const leases = Array.isArray(body?.leases) ? body.leases : [];
  if (
    status !== 200
    || body?.isResident !== true
    || body?.canCreate !== true
    || !leases.some((lease) => lease?.id === leaseId)
  ) {
    throw new Error(`Resident portal did not expose the matched lease (${diagnostic(status, body)})`);
  }
}

export function validateResidentTicketCreated(status, body) {
  if (status !== 201 || !hasId(body?.ticket?.id)) {
    throw new Error(`Resident ticket did not persist (${diagnostic(status, body)})`);
  }
  return body.ticket.id;
}

export function validateResidentTicketVisible(status, body, ticketId) {
  if (status !== 200 || body?.ticket?.id !== ticketId) {
    throw new Error(`Resident ticket was not visible on the portal (${diagnostic(status, body)})`);
  }
}

export function validateForeignLeaseHidden(status, body) {
  if (status !== 404) {
    throw new Error(`Foreign lease was visible to the resident (${diagnostic(status, body)})`);
  }
}

export function validateResidentBookingCreated(status, body) {
  if (status !== 201 || !hasId(body?.booking?.id)) {
    throw new Error(`Resident booking did not persist (${diagnostic(status, body)})`);
  }
  return body.booking.id;
}

export function validateResidentBookingOverlapRejected(status, body) {
  if (status !== 409 || hasId(body?.booking?.id)) {
    throw new Error(`Overlapping resident booking was not rejected (${diagnostic(status, body)})`);
  }
}
