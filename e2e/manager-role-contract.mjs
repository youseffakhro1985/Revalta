function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

function diagnostic(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  const code = typeof body?.errorCode === "string" && /^[A-Z_]+$/.test(body.errorCode) ? body.errorCode : "none";
  return `${status}:${code}`;
}

export function validateManagerCreated(status, body) {
  if (status !== 201 || body?.member?.role !== "manager" || !hasId(body?.member?.id)) {
    throw new Error(`Manager fixture was not created (${diagnostic(status, body)})`);
  }
  return body.member.id;
}

export function validateManagerProfile(status, body, companyId) {
  const user = body?.user;
  if (
    status !== 200
    || user?.role !== "manager"
    || user?.status !== "active"
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
  ) {
    throw new Error(`Manager profile was not a scoped staff fixture (${diagnostic(status, body)})`);
  }
}

export function validateManagerForbidden(status, body, label) {
  if (status !== 403) {
    throw new Error(`${label} was not forbidden (${diagnostic(status, body)})`);
  }
}

export function validateManagerPropertyCreateAllowed(status, body) {
  if (status !== 200 || body?.permissions?.canCreate !== true) {
    throw new Error(`Manager property create capability was not granted (${diagnostic(status, body)})`);
  }
}

export function validateManagerOperationsReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.schedules) || !body?.health) {
    throw new Error(`Manager operations overview was not readable (${diagnostic(status, body)})`);
  }
}

export function validateManagerAssignQueueReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.workOrders) || !Array.isArray(body?.assignees)) {
    throw new Error(`Manager assign queue was not readable (${diagnostic(status, body)})`);
  }
}

export function validateManagerWorkOrderWritable(status, body, workOrderId) {
  if (
    status !== 200
    || body?.workOrder?.id !== workOrderId
    || body?.canManage !== true
    || body?.canAssign !== true
    || body?.canViewFinance !== true
    || body?.canManageFinance !== true
  ) {
    throw new Error(`Manager did not get writable work-order and finance access (${diagnostic(status, body)})`);
  }
}

export function validateManagerInvoiceManageable(status, body) {
  if (status !== 200 || body?.canManage !== true) {
    throw new Error(`Manager invoice basis was not manageable (${diagnostic(status, body)})`);
  }
}

export function validateManagerLockAcquired(status, body) {
  const token = body?.lock?.token;
  if (status !== 201 || !hasId(token)) {
    throw new Error(`Manager work-order edit lock was not acquired (${diagnostic(status, body)})`);
  }
  return token;
}

export function validateManagerLockBoardReadable(status, body) {
  if (status !== 200 || body?.canForceRelease !== false || !Array.isArray(body?.locks)) {
    throw new Error(`Manager lock board was not readable without force-release (${diagnostic(status, body)})`);
  }
}

export function validateOwnerForceRelease(status, body) {
  if (status !== 200 && status !== 404) {
    throw new Error(`Owner could not clear a leftover work-order edit lock (${diagnostic(status, body)})`);
  }
}
