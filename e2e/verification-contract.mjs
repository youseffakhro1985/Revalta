// Only fixed diagnostic messages leave these validators. Never include response
// bodies, credentials, cookies or user/company details in CI output.
export function validateLoginResponse(status, body, email) {
  if (status !== 200 || body?.success !== true || body?.user?.email !== email) {
    throw new Error("Verified fixture login did not succeed");
  }
}

export function validateFixtureProfile(status, body, { email, companyId }) {
  const user = body?.user;
  if (
    status !== 200
    || !companyId
    || user?.email !== email
    || user?.role !== "owner"
    || user?.status !== "active"
    || typeof user?.email_verified_at !== "string"
    || !Number.isFinite(Date.parse(user.email_verified_at))
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
    || user?.company?.status !== "active"
  ) {
    throw new Error("Fixture must be a verified active owner in the expected test company");
  }
}

export function validateOwnerBillingPreviewDirectPlan(status, body) {
  if (status !== 200 || body?.canManage !== true || body?.canDirectChangePlan !== true) {
    throw new Error("Verified owner billing did not expose Preview-only direct plan changes");
  }
}

export function validateOwnerBillingPlanRegistry(status, body) {
  const plans = body?.plans;
  if (
    status !== 200
    || body?.canManage !== true
    || !plans
    || plans.start?.label !== "Start"
    || plans.professional?.label !== "Standard"
    || plans.enterprise?.label !== "Professional"
  ) {
    throw new Error("Verified owner billing plan registry was not the canonical allowlist");
  }
}

export function validateOwnerBillingStripeReadiness(status, body) {
  const readiness = body?.stripePlanReadiness;
  if (
    status !== 200
    || typeof body?.stripeConfigured !== "boolean"
    || typeof readiness?.start !== "boolean"
    || typeof readiness?.professional !== "boolean"
    || typeof readiness?.enterprise !== "boolean"
  ) {
    throw new Error("Verified owner billing did not expose Stripe readiness flags");
  }
}

export function validateOwnerBillingStripePortalReady(status, body) {
  if (status !== 200 || typeof body?.stripePortalReady !== "boolean") {
    throw new Error("Verified owner billing did not expose Stripe portal readiness");
  }
}

export function validateOwnerBillingPreviewPlanChanged(status, body, plan) {
  if (status !== 200 || body?.success !== true || body?.company?.plan !== plan) {
    throw new Error("Verified owner billing did not apply the Preview-only direct plan change");
  }
}

export function validateOwnerBillingPreviewInvalidPlan(status, body) {
  if (status !== 400 || body?.errorCode !== "VALIDATION_FAILED") {
    throw new Error("Verified owner billing did not reject an invalid Preview plan change");
  }
}

export function validateOwnerOnboardingEligible(status, body) {
  if (status !== 200 || body?.eligible !== true || !body?.progress || typeof body.progress !== "object") {
    throw new Error("Verified owner onboarding was not returned as eligible");
  }
}

export function validateOwnerOnboardingVerified(status, body) {
  if (status !== 200 || body?.success !== true || !body?.progress || typeof body.progress !== "object") {
    throw new Error("Verified owner onboarding verify did not persist");
  }
}

export function validateOwnerIntegrationsReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.integrations)) {
    throw new Error("Verified owner integrations did not return a readable list");
  }
}

export function validateOwnerCompanyManageable(status, body, companyId) {
  if (status !== 200 || body?.canManage !== true || body?.company?.id !== companyId) {
    throw new Error("Verified owner company settings did not stay manageable");
  }
}

export function validateOwnerAuditReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.auditLogs)) {
    throw new Error("Verified owner audit log was not readable");
  }
}

export function validateOwnerOperationsReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.schedules) || !body?.health) {
    throw new Error("Verified owner operations overview was not readable");
  }
}

export function validateOwnerAssignQueueReadable(status, body) {
  if (status !== 200 || !Array.isArray(body?.workOrders) || !Array.isArray(body?.assignees)) {
    throw new Error("Verified owner assign queue was not readable");
  }
}

export function validateOwnerLockBoardForceRelease(status, body) {
  if (status !== 200 || body?.canForceRelease !== true || !Array.isArray(body?.locks)) {
    throw new Error("Verified owner lock board did not allow force-release");
  }
}

export function validateOwnerUnknownPropertyNotFound(status, body) {
  if (status !== 404 || body?.errorCode !== "NOT_FOUND") {
    throw new Error("Verified owner unknown property did not stay not found");
  }
}

export function validateOwnerUnknownTicketNotFound(status, body) {
  if (status !== 404 || body?.success === true) {
    throw new Error("Verified owner unknown ticket did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderNotFound(status, body) {
  if (status !== 404 || body?.success === true) {
    throw new Error("Verified owner unknown work order did not stay not found");
  }
}

export function validateOwnerUnknownLeaseNotFound(status, body) {
  if (status !== 404 || body?.success === true) {
    throw new Error("Verified owner unknown lease did not stay not found");
  }
}

export function validateOwnerUnknownProjectNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Projektet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown project did not stay not found");
  }
}

export function validateOwnerUnknownInspectionNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Kontrollen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown inspection did not stay not found");
  }
}

export function validateOwnerUnknownCalendarNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Aktiviteten hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown calendar event did not stay not found");
  }
}

export function validateOwnerUnknownTeamMemberNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Teammedlemmen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown team member did not stay not found");
  }
}

export function validateOwnerUnknownRoundNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ronden hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown round did not stay not found");
  }
}

export function validateOwnerUnknownVendorNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Leverantören hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown vendor did not stay not found");
  }
}

export function validateOwnerUnknownQuoteNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Offerten hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown quote did not stay not found");
  }
}

export function validateOwnerUnknownChecklistNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Checklistan hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown checklist did not stay not found");
  }
}

export function validateOwnerUnknownBookingNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Bokningen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown booking did not stay not found");
  }
}

export function validateOwnerUnknownClaimNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Skadeärendet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown insurance claim did not stay not found");
  }
}

export function validateOwnerUnknownEnergyNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Avläsningen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown energy reading did not stay not found");
  }
}

export function validateOwnerUnknownAccessNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Behörigheten hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown access credential did not stay not found");
  }
}

export function validateOwnerUnknownImdNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Avläsningen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown IMD reading did not stay not found");
  }
}

export function validateOwnerUnknownDocumentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Dokumentet hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown document did not stay not found");
  }
}

export function validateOwnerUnknownOperationalDocumentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Dokumentet hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown operational document did not stay not found");
  }
}

export function validateOwnerUnknownBudgetNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Budgetraden hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown budget entry did not stay not found");
  }
}

export function validateOwnerUnknownLeaseHolderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Kontakten hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown lease holder did not stay not found");
  }
}

export function validateOwnerUnknownRentNoticeNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Hyresavin hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown rent notice did not stay not found");
  }
}

export function validateOwnerUnknownNotificationNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Notisen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown notification did not stay not found");
  }
}

export function validateOwnerUnknownMaintenanceNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Underhållsåtgärden hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown maintenance item did not stay not found");
  }
}

export function validateOwnerUnknownBuildingNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Fastigheten hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown building property did not stay not found");
  }
}

export function validateOwnerUnknownUnitNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Fastigheten hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown unit property did not stay not found");
  }
}

export function validateOwnerUnknownComponentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Komponenten hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown component did not stay not found");
  }
}

export function validateOwnerUnknownTicketRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ärendet hittades inte eller är redan aktivt" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown ticket restore did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte eller är redan aktiv" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order restore did not stay not found");
  }
}

export function validateOwnerUnknownPropertyRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Fastigheten hittades inte eller är redan aktiv" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown property restore did not stay not found");
  }
}

export function validateOwnerUnknownProjectRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Projektet hittades inte eller är redan aktivt" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown project restore did not stay not found");
  }
}

export function validateOwnerUnknownLeaseRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Avtalet hittades inte eller är redan aktivt" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown lease restore did not stay not found");
  }
}

export function validateOwnerUnknownLeaseHolderRestoreNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Kontakten hittades inte eller är redan aktiv" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown lease-holder restore did not stay not found");
  }
}

export function validateOwnerUnknownTicketCommentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ärendet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown ticket comment did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderCommentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order comment did not stay not found");
  }
}

export function validateOwnerUnknownProjectCommentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Projektet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown project comment did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderTimeEntryNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order time entry did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderMaterialNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order material did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderExecutionNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order execution did not stay not found");
  }
}

export function validateOwnerUnknownTicketWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ärendet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown ticket work-order did not stay not found");
  }
}

export function validateOwnerUnknownInspectionWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Kontrollen hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown inspection work-order did not stay not found");
  }
}

export function validateOwnerUnknownQuoteWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Offerten hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown quote work-order did not stay not found");
  }
}

export function validateOwnerUnknownInsuranceClaimWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Skadeärendet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown insurance-claim work-order did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderProjectNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown work-order project did not stay not found");
  }
}

export function validateOwnerUnknownRoundWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ronden hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown round work-order did not stay not found");
  }
}

export function validateOwnerUnknownLeaseInspectionWorkOrderNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Avtalet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown lease inspection work-order did not stay not found");
  }
}

export function validateOwnerUnknownWorkOrderDocumentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Arbetsordern hittades inte" ||
    body?.errorCode !== "NOT_FOUND"
  ) {
    throw new Error("Verified owner unknown work-order document did not stay not found");
  }
}

export function validateOwnerUnknownTicketAttachmentNotFound(status, body) {
  if (
    status !== 404 ||
    body?.success === true ||
    body?.error !== "Ärendet hittades inte" ||
    body?.errorCode
  ) {
    throw new Error("Verified owner unknown ticket attachment did not stay not found");
  }
}

export function isPaginatedPropertiesRequest(url) {
  try {
    const parsed = new URL(url, "https://e2e.invalid");
    return parsed.pathname === "/api/properties" && parsed.searchParams.has("page");
  } catch {
    return false;
  }
}

export function validatePropertiesResponse(status, body) {
  if (
    status !== 200
    || !Array.isArray(body?.properties)
    || !Number.isSafeInteger(body?.pagination?.total)
    || body.pagination.total < body.properties.length
  ) {
    throw new Error("Property navigation did not load a valid paginated API response");
  }
}

export function validateEmptySearchResponse(status, body) {
  if (status !== 200 || !Array.isArray(body?.results) || body.results.length !== 0) {
    throw new Error("Command Center empty state requires a successful empty search response");
  }
}

const SAFE_FAILURE = /did not |was not |not visible|not persist|lifecycle|illegal |audit history|readable after|Fixture |Unknown browser|skipped|lock was not|HTTP \d+|release identity|Cross-origin|Verified login|Verified fixture|Property navigation|Command Center|Work-order |Ticket |Time entry |Material |Invoice |Staff ticket|A required browser/;

export function sanitizePreviewFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("BLOCKED")) return message.slice(0, 300);
  if (SAFE_FAILURE.test(message)) {
    return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\S+@\S+/g, "[email]").slice(0, 300);
  }
  if (/Timeout .*exceeded/i.test(message) || /exceeded .*timeout/i.test(message)) {
    return "A required browser event timed out";
  }
  return "Preview verification failed; no release approval. Check target, fixtures and required browser steps.";
}
