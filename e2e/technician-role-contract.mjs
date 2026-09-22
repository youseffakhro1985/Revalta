function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

function diagnostic(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  const code = typeof body?.errorCode === "string" && /^[A-Z_]+$/.test(body.errorCode) ? body.errorCode : "none";
  return `${status}:${code}`;
}

export function validateTechnicianCreated(status, body) {
  if (status !== 201 || body?.member?.role !== "technician" || !hasId(body?.member?.id)) {
    throw new Error(`Technician fixture was not created (${diagnostic(status, body)})`);
  }
  return body.member.id;
}

export function validateTechnicianProfile(status, body, companyId) {
  const user = body?.user;
  if (
    status !== 200
    || user?.role !== "technician"
    || user?.status !== "active"
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
  ) {
    throw new Error(`Technician profile was not a scoped staff fixture (${diagnostic(status, body)})`);
  }
}

export function validateTechnicianForbidden(status, body, label) {
  if (status !== 403) {
    throw new Error(`${label} was not forbidden (${diagnostic(status, body)})`);
  }
}

export function validateUnassignedWorkOrderHidden(status, body) {
  if (status !== 404) {
    throw new Error(`Unassigned work order was visible to technician (${diagnostic(status, body)})`);
  }
}

export function validateAssignedWorkOrderVisible(status, body, workOrderId) {
  if (status !== 200 || body?.workOrder?.id !== workOrderId) {
    throw new Error(`Assigned work order was not visible to technician (${diagnostic(status, body)})`);
  }
}
