function hasId(value) {
  return typeof value === "string" && value.length > 0;
}

function diagnostic(status, body) {
  const redirected = Number.isInteger(status) && ((status >= 300 && status < 400) || status === 0);
  if (redirected) return `${status}:redirect`;
  const code = typeof body?.errorCode === "string" && /^[A-Z_]+$/.test(body.errorCode) ? body.errorCode : "none";
  return `${status}:${code}`;
}

export function validateAdminCreated(status, body) {
  if (status !== 201 || body?.member?.role !== "admin" || !hasId(body?.member?.id)) {
    throw new Error(`Admin fixture was not created (${diagnostic(status, body)})`);
  }
  return body.member.id;
}

export function validateAdminProfile(status, body, companyId) {
  const user = body?.user;
  if (
    status !== 200
    || user?.role !== "admin"
    || user?.status !== "active"
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
  ) {
    throw new Error(`Admin profile was not a scoped staff fixture (${diagnostic(status, body)})`);
  }
}

export function validateAdminForbidden(status, body, label) {
  if (status !== 403) {
    throw new Error(`${label} was not forbidden (${diagnostic(status, body)})`);
  }
}

export function validateAdminPropertyCreateAllowed(status, body) {
  if (status !== 200 || body?.permissions?.canCreate !== true) {
    throw new Error(`Admin property create capability was not granted (${diagnostic(status, body)})`);
  }
}

export function validateAdminAuditReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.auditLogs)) {
    throw new Error(`Admin audit log was not readable (${diagnostic(status, body)})`);
  }
}

export function validateAdminOperationsReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.schedules) || !body?.health) {
    throw new Error(`Admin operations overview was not readable (${diagnostic(status, body)})`);
  }
}

export function validateAdminAssignQueueReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.workOrders) || !Array.isArray(body?.assignees)) {
    throw new Error(`Admin assign queue was not readable (${diagnostic(status, body)})`);
  }
}

export function validateAdminWorkOrderWritable(status, body, workOrderId) {
  if (
    status !== 200
    || body?.workOrder?.id !== workOrderId
    || body?.canManage !== true
    || body?.canAssign !== true
    || body?.canViewFinance !== true
    || body?.canManageFinance !== true
  ) {
    throw new Error(`Admin did not get writable work-order and finance access (${diagnostic(status, body)})`);
  }
}

export function validateAdminInvoiceManageable(status, body) {
  if (status !== 200 || body?.canManage !== true) {
    throw new Error(`Admin invoice basis was not manageable (${diagnostic(status, body)})`);
  }
}

export function validateAdminLockBoardForceRelease(status, body) {
  if (status !== 200 || body?.canForceRelease !== true || !Array.isArray(body?.locks)) {
    throw new Error(`Admin lock board did not allow force-release (${diagnostic(status, body)})`);
  }
}

export function validateAdminForceRelease(status, body) {
  if (status !== 200 && status !== 404) {
    throw new Error(`Admin could not clear a leftover work-order edit lock (${diagnostic(status, body)})`);
  }
}

export function validateAdminLockAcquired(status, body) {
  const token = body?.lock?.token;
  if (status !== 201 || !hasId(token)) {
    throw new Error(`Admin work-order edit lock was not acquired (${diagnostic(status, body)})`);
  }
  return token;
}

export function validateAdminCompanyManageable(status, body, companyId) {
  if (status !== 200 || body?.canManage !== true || body?.company?.id !== companyId) {
    throw new Error(`Admin company settings were not manageable (${diagnostic(status, body)})`);
  }
}

export function validateAdminBillingReadable(status, body) {
  if (status !== 200 || body?.canManage !== true) {
    throw new Error(`Admin billing was not readable (${diagnostic(status, body)})`);
  }
}

export function validateAdminBillingPlanRegistry(status, body) {
  const plans = body?.plans;
  if (
    status !== 200
    || body?.canManage !== true
    || !plans
    || plans.start?.label !== "Start"
    || plans.professional?.label !== "Standard"
    || plans.enterprise?.label !== "Professional"
  ) {
    throw new Error(`Admin billing plan registry was not the canonical allowlist (${diagnostic(status, body)})`);
  }
}

export function validateAdminIntegrationsReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.integrations)) {
    throw new Error(`Admin integrations were not readable (${diagnostic(status, body)})`);
  }
}

export function validateAdminOnboardingEligible(status, body) {
  if (status !== 200 || body?.eligible !== true || !body?.progress || typeof body.progress !== "object") {
    throw new Error(`Admin onboarding was not returned as eligible (${diagnostic(status, body)})`);
  }
}

export function validateAdminOnboardingVerified(status, body) {
  if (status !== 200 || body?.success !== true || !body?.progress || typeof body.progress !== "object") {
    throw new Error(`Admin onboarding verify did not persist (${diagnostic(status, body)})`);
  }
}
