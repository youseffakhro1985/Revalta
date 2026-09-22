function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

function diagnostic(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  const code = typeof body?.errorCode === "string" && /^[A-Z_]+$/.test(body.errorCode) ? body.errorCode : "none";
  return `${status}:${code}`;
}

export function validateViewerCreated(status, body) {
  if (status !== 201 || body?.member?.role !== "viewer" || !hasId(body?.member?.id)) {
    throw new Error(`Viewer fixture was not created (${diagnostic(status, body)})`);
  }
  return body.member.id;
}

export function validateViewerProfile(status, body, companyId) {
  const user = body?.user;
  if (
    status !== 200
    || user?.role !== "viewer"
    || user?.status !== "active"
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
  ) {
    throw new Error(`Viewer profile was not a scoped staff fixture (${diagnostic(status, body)})`);
  }
}

export function validateViewerForbidden(status, body, label) {
  if (status !== 403) {
    throw new Error(`${label} was not forbidden (${diagnostic(status, body)})`);
  }
}

export function validateViewerPropertyCreateDenied(status, body) {
  if (status !== 200 || body?.permissions?.canCreate !== false) {
    throw new Error(`Viewer property create capability was not denied (${diagnostic(status, body)})`);
  }
}

export function validateViewerWorkOrderReadable(status, body, workOrderId) {
  if (
    status !== 200
    || body?.workOrder?.id !== workOrderId
    || body?.canViewFinance !== true
    || body?.canManage !== false
    || body?.canManageFinance !== false
  ) {
    throw new Error(`Viewer did not get company-wide read-only work-order access (${diagnostic(status, body)})`);
  }
}

export function validateViewerInvoiceReadable(status, body) {
  if (status !== 200 || body?.canManage !== false) {
    throw new Error(`Viewer invoice basis was not readable without manage rights (${diagnostic(status, body)})`);
  }
}
