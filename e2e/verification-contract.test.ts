import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isPaginatedPropertiesRequest, sanitizePreviewFailure, validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validateOwnerAssignQueueReadable, validateOwnerAuditReadable, validateOwnerBillingPlanRegistry, validateOwnerBillingPreviewDirectPlan, validateOwnerBillingPreviewInvalidPlan, validateOwnerBillingPreviewPlanChanged, validateOwnerBillingStripePortalReady, validateOwnerBillingStripeReadiness, validateOwnerCompanyManageable, validateOwnerIntegrationsReadable, validateOwnerLockBoardForceRelease, validateOwnerOnboardingEligible, validateOwnerOnboardingVerified, validateOwnerOperationsReadable, validateOwnerUnknownAccessNotFound, validateOwnerUnknownBookingNotFound, validateOwnerUnknownBudgetNotFound, validateOwnerUnknownBuildingNotFound, validateOwnerUnknownComponentNotFound, validateOwnerUnknownTicketRestoreNotFound, validateOwnerUnknownWorkOrderRestoreNotFound, validateOwnerUnknownPropertyRestoreNotFound, validateOwnerUnknownProjectRestoreNotFound, validateOwnerUnknownLeaseRestoreNotFound, validateOwnerUnknownLeaseHolderRestoreNotFound, validateOwnerUnknownTicketCommentNotFound, validateOwnerUnknownWorkOrderCommentNotFound, validateOwnerUnknownProjectCommentNotFound, validateOwnerUnknownWorkOrderTimeEntryNotFound, validateOwnerUnknownWorkOrderMaterialNotFound, validateOwnerUnknownWorkOrderExecutionNotFound, validateOwnerUnknownTicketWorkOrderNotFound, validateOwnerUnknownInspectionWorkOrderNotFound, validateOwnerUnknownQuoteWorkOrderNotFound, validateOwnerUnknownInsuranceClaimWorkOrderNotFound, validateOwnerUnknownWorkOrderProjectNotFound, validateOwnerUnknownRoundWorkOrderNotFound, validateOwnerUnknownLeaseInspectionWorkOrderNotFound, validateOwnerUnknownWorkOrderDocumentNotFound, validateOwnerUnknownTicketAttachmentNotFound, validateOwnerUnknownMaintenancePlanWorkOrderNotFound, validateOwnerUnknownWorkOrderReportNotFound, validateOwnerUnknownWorkOrderSlaNotFound, validateOwnerUnknownWorkOrderEditLockNotFound, validateOwnerUnknownWorkOrderInvoiceBasisNotFound, validateOwnerUnknownWorkOrderProfitabilityNotFound, validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound, validateOwnerUnknownWorkOrderTransitionsNotFound, validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound, validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound, validateOwnerUnknownWorkOrderProfitabilityGetNotFound, validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound, validateOwnerUnknownWorkOrderAssetOptionsNotFound, validateOwnerUnknownWorkOrderAttestationNotFound, validateOwnerUnknownWorkOrderLockedUpdateNotFound, validateOwnerUnknownWorkOrderDocumentItemNotFound, validateOwnerUnknownTicketOperationsGetNotFound, validateOwnerUnknownTicketOperationsPostNotFound, validateOwnerUnknownTicketOperationsPatchNotFound, validateOwnerUnknownTicketOperationsDeleteNotFound, validateOwnerUnknownTicketTimelineNotFound, validateOwnerUnknownTicketSmsNotFound, validateOwnerUnknownTicketAiNotFound, validateOwnerUnknownLeaseHandoverNotFound, validateOwnerUnknownLeaseHandoverPutNotFound, validateOwnerUnknownLeaseInspectionItemsNotFound, validateOwnerUnknownLeaseInspectionItemsPutNotFound, validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound, validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound, validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound, validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound, validateOwnerUnknownPropertyCardNotFound, validateOwnerUnknownPropertyComponentsNotFound, validateOwnerUnknownPropertyMaintenancePlanNotFound, validateOwnerUnknownDocumentDownloadNotFound, validateOwnerUnknownAttachmentNotFound, validateOwnerUnknownWorkOrderReportItemNotFound, validateOwnerUnknownImdAttachNoticeNotFound, validateOwnerUnknownOperationalDocumentDownloadNotFound, validateOwnerUnknownPublicTicketNotFound, validateOwnerUnknownUnitNotFound, validateOwnerUnknownCalendarNotFound, validateOwnerUnknownChecklistNotFound, validateOwnerUnknownClaimNotFound, validateOwnerUnknownEnergyNotFound, validateOwnerUnknownDocumentNotFound, validateOwnerUnknownImdNotFound, validateOwnerUnknownOperationalDocumentNotFound, validateOwnerUnknownInspectionNotFound, validateOwnerUnknownLeaseHolderNotFound, validateOwnerUnknownRentNoticeNotFound, validateOwnerUnknownNotificationNotFound, validateOwnerUnknownMaintenanceNotFound, validateOwnerUnknownLeaseNotFound, validateOwnerUnknownProjectNotFound, validateOwnerUnknownPropertyNotFound, validateOwnerUnknownQuoteNotFound, validateOwnerUnknownRoundNotFound, validateOwnerUnknownTeamMemberNotFound, validateOwnerUnknownTicketNotFound, validateOwnerUnknownVendorNotFound, validateOwnerUnknownWorkOrderNotFound, validatePropertiesResponse } from "./verification-contract.mjs";

const fixture = { email: "fixture@example.com", companyId: "synthetic-company-a" };
const user = {
  email: fixture.email, role: "owner", status: "active",
  email_verified_at: "2026-09-08T00:00:00.000Z", company_id: fixture.companyId,
  company: { id: fixture.companyId, status: "active" },
};

describe("authenticated Preview evidence", () => {
  it("requires the authenticated account to match the expected fixture", () => {
    expect(() => validateLoginResponse(200, { success: true, user }, fixture.email)).not.toThrow();
    expect(() => validateLoginResponse(200, { success: true, user: { email: "other@example.com" } }, fixture.email)).toThrow();
    expect(() => validateLoginResponse(401, { success: true, user }, fixture.email)).toThrow();
    expect(() => validateLoginResponse(200, { user }, fixture.email)).toThrow();
  });

  it("accepts a verified active owner with the exact company relation", () => {
    expect(() => validateFixtureProfile(200, { user }, fixture)).not.toThrow();
  });

  it("requires owner billing to expose Preview-only direct plan changes", () => {
    expect(() => validateOwnerBillingPreviewDirectPlan(200, { canManage: true, canDirectChangePlan: true })).not.toThrow();
    expect(() => validateOwnerBillingPreviewDirectPlan(200, { canManage: true, canDirectChangePlan: false })).toThrow(
      /did not expose Preview-only direct plan changes/,
    );
    expect(() => validateOwnerBillingPreviewDirectPlan(403, { errorCode: "FORBIDDEN" })).toThrow(
      /did not expose Preview-only direct plan changes/,
    );
  });

  it("requires owner billing to expose the canonical plan registry", () => {
    const plans = { start: { label: "Start" }, professional: { label: "Standard" }, enterprise: { label: "Professional" } };
    expect(() => validateOwnerBillingPlanRegistry(200, { canManage: true, plans })).not.toThrow();
    expect(() => validateOwnerBillingPlanRegistry(200, { canManage: true, plans: { ...plans, professional: { label: "Pro" } } })).toThrow(
      /plan registry was not the canonical allowlist/,
    );
  });

  it("requires owner billing to expose Stripe readiness flags", () => {
    const stripePlanReadiness = { start: true, professional: false, enterprise: false };
    expect(() => validateOwnerBillingStripeReadiness(200, { stripeConfigured: false, stripePlanReadiness })).not.toThrow();
    expect(() => validateOwnerBillingStripeReadiness(200, { stripeConfigured: "yes", stripePlanReadiness })).toThrow(
      /did not expose Stripe readiness flags/,
    );
  });

  it("requires owner billing to expose Stripe portal readiness", () => {
    expect(() => validateOwnerBillingStripePortalReady(200, { stripePortalReady: false })).not.toThrow();
    expect(() => validateOwnerBillingStripePortalReady(200, { stripePortalReady: "no" })).toThrow(
      /did not expose Stripe portal readiness/,
    );
  });

  it("requires owner billing to apply an allowlisted Preview plan change", () => {
    expect(() => validateOwnerBillingPreviewPlanChanged(200, { success: true, company: { plan: "start" } }, "start")).not.toThrow();
    expect(() => validateOwnerBillingPreviewPlanChanged(200, { success: true, company: { plan: "professional" } }, "start")).toThrow(
      /did not apply the Preview-only direct plan change/,
    );
    expect(() => validateOwnerBillingPreviewPlanChanged(403, { errorCode: "FORBIDDEN" }, "start")).toThrow(
      /did not apply the Preview-only direct plan change/,
    );
  });

  it("requires owner billing to reject an invalid Preview plan change", () => {
    expect(() => validateOwnerBillingPreviewInvalidPlan(400, { errorCode: "VALIDATION_FAILED" })).not.toThrow();
    expect(() => validateOwnerBillingPreviewInvalidPlan(200, { success: true })).toThrow(
      /did not reject an invalid Preview plan change/,
    );
  });

  it("requires owner onboarding to be eligible and persist ticket-intake verify", () => {
    expect(() => validateOwnerOnboardingEligible(200, { eligible: true, progress: { propertyCount: 1 } })).not.toThrow();
    expect(() => validateOwnerOnboardingEligible(200, { eligible: false, progress: null })).toThrow(
      /onboarding was not returned as eligible/,
    );
    expect(() => validateOwnerOnboardingVerified(200, { success: true, progress: { propertyCount: 1 } })).not.toThrow();
    expect(() => validateOwnerOnboardingVerified(403, { errorCode: "FORBIDDEN" })).toThrow(
      /onboarding verify did not persist/,
    );
  });

  it("requires owner integrations to be readable on Preview", () => {
    expect(() => validateOwnerIntegrationsReadable(200, { integrations: [] })).not.toThrow();
    expect(() => validateOwnerIntegrationsReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /integrations did not return a readable list/,
    );
  });

  it("requires owner company settings to stay manageable on Preview", () => {
    expect(() => validateOwnerCompanyManageable(200, { canManage: true, company: { id: fixture.companyId } }, fixture.companyId)).not.toThrow();
    expect(() => validateOwnerCompanyManageable(200, { canManage: false, company: { id: fixture.companyId } }, fixture.companyId)).toThrow(
      /company settings did not stay manageable/,
    );
  });

  it("requires owner audit log to be readable on Preview", () => {
    expect(() => validateOwnerAuditReadable(200, { auditLogs: [] })).not.toThrow();
    expect(() => validateOwnerAuditReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /audit log was not readable/,
    );
  });

  it("requires owner operations overview to be readable on Preview", () => {
    expect(() => validateOwnerOperationsReadable(200, { schedules: [], health: { activeSchedules: 0 } })).not.toThrow();
    expect(() => validateOwnerOperationsReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /operations overview was not readable/,
    );
  });

  it("requires owner assign queue to be readable on Preview", () => {
    expect(() => validateOwnerAssignQueueReadable(200, { workOrders: [], assignees: [] })).not.toThrow();
    expect(() => validateOwnerAssignQueueReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /assign queue was not readable/,
    );
  });

  it("requires owner lock board to allow force-release on Preview", () => {
    expect(() => validateOwnerLockBoardForceRelease(200, { canForceRelease: true, locks: [] })).not.toThrow();
    expect(() => validateOwnerLockBoardForceRelease(200, { canForceRelease: false, locks: [] })).toThrow(
      /lock board did not allow force-release/,
    );
  });

  it("requires owner unknown property writes to stay not found", () => {
    expect(() => validateOwnerUnknownPropertyNotFound(404, { errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownPropertyNotFound(200, { success: true })).toThrow(
      /unknown property did not stay not found/,
    );
  });

  it("requires owner unknown ticket writes to stay not found", () => {
    expect(() => validateOwnerUnknownTicketNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketNotFound(200, { success: true })).toThrow(
      /unknown ticket did not stay not found/,
    );
  });

  it("requires owner unknown work-order writes to stay not found", () => {
    expect(() => validateOwnerUnknownWorkOrderNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown work order did not stay not found/,
    );
  });

  it("requires owner unknown lease writes to stay not found", () => {
    expect(() => validateOwnerUnknownLeaseNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseNotFound(200, { success: true })).toThrow(
      /unknown lease did not stay not found/,
    );
  });

  it("requires owner unknown project writes to stay not found", () => {
    expect(() => validateOwnerUnknownProjectNotFound(404, { error: "Projektet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownProjectNotFound(200, { success: true })).toThrow(
      /unknown project did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectNotFound(404, { error: "Projektet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown project did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectNotFound(404, { error: "Not found" })).toThrow(
      /unknown project did not stay not found/,
    );
  });

  it("requires owner unknown inspection writes to stay not found", () => {
    expect(() => validateOwnerUnknownInspectionNotFound(404, { error: "Kontrollen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownInspectionNotFound(200, { success: true })).toThrow(
      /unknown inspection did not stay not found/,
    );
    expect(() => validateOwnerUnknownInspectionNotFound(404, { error: "Kontrollen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown inspection did not stay not found/,
    );
    expect(() => validateOwnerUnknownInspectionNotFound(404, { error: "Not found" })).toThrow(
      /unknown inspection did not stay not found/,
    );
  });

  it("requires owner unknown calendar writes to stay not found", () => {
    expect(() => validateOwnerUnknownCalendarNotFound(404, { error: "Aktiviteten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownCalendarNotFound(200, { success: true })).toThrow(
      /unknown calendar event did not stay not found/,
    );
    expect(() => validateOwnerUnknownCalendarNotFound(404, { error: "Aktiviteten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown calendar event did not stay not found/,
    );
    expect(() => validateOwnerUnknownCalendarNotFound(404, { error: "Not found" })).toThrow(
      /unknown calendar event did not stay not found/,
    );
  });

  it("requires owner unknown team member writes to stay not found", () => {
    expect(() => validateOwnerUnknownTeamMemberNotFound(404, { error: "Teammedlemmen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTeamMemberNotFound(200, { success: true })).toThrow(
      /unknown team member did not stay not found/,
    );
    expect(() => validateOwnerUnknownTeamMemberNotFound(404, { error: "Teammedlemmen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown team member did not stay not found/,
    );
    expect(() => validateOwnerUnknownTeamMemberNotFound(404, { error: "Not found" })).toThrow(
      /unknown team member did not stay not found/,
    );
  });

  it("requires owner unknown round writes to stay not found", () => {
    expect(() => validateOwnerUnknownRoundNotFound(404, { error: "Ronden hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownRoundNotFound(200, { success: true })).toThrow(
      /unknown round did not stay not found/,
    );
    expect(() => validateOwnerUnknownRoundNotFound(404, { error: "Ronden hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown round did not stay not found/,
    );
    expect(() => validateOwnerUnknownRoundNotFound(404, { error: "Not found" })).toThrow(
      /unknown round did not stay not found/,
    );
  });

  it("requires owner unknown vendor writes to stay not found", () => {
    expect(() => validateOwnerUnknownVendorNotFound(404, { error: "Leverantören hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownVendorNotFound(200, { success: true })).toThrow(
      /unknown vendor did not stay not found/,
    );
    expect(() => validateOwnerUnknownVendorNotFound(404, { error: "Leverantören hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown vendor did not stay not found/,
    );
    expect(() => validateOwnerUnknownVendorNotFound(404, { error: "Not found" })).toThrow(
      /unknown vendor did not stay not found/,
    );
  });

  it("requires owner unknown quote writes to stay not found", () => {
    expect(() => validateOwnerUnknownQuoteNotFound(404, { error: "Offerten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownQuoteNotFound(200, { success: true })).toThrow(
      /unknown quote did not stay not found/,
    );
    expect(() => validateOwnerUnknownQuoteNotFound(404, { error: "Offerten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown quote did not stay not found/,
    );
    expect(() => validateOwnerUnknownQuoteNotFound(404, { error: "Not found" })).toThrow(
      /unknown quote did not stay not found/,
    );
  });

  it("requires owner unknown checklist writes to stay not found", () => {
    expect(() => validateOwnerUnknownChecklistNotFound(404, { error: "Checklistan hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownChecklistNotFound(200, { success: true })).toThrow(
      /unknown checklist did not stay not found/,
    );
    expect(() => validateOwnerUnknownChecklistNotFound(404, { error: "Checklistan hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown checklist did not stay not found/,
    );
    expect(() => validateOwnerUnknownChecklistNotFound(404, { error: "Not found" })).toThrow(
      /unknown checklist did not stay not found/,
    );
  });

  it("requires owner unknown booking writes to stay not found", () => {
    expect(() => validateOwnerUnknownBookingNotFound(404, { error: "Bokningen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownBookingNotFound(200, { success: true })).toThrow(
      /unknown booking did not stay not found/,
    );
    expect(() => validateOwnerUnknownBookingNotFound(404, { error: "Bokningen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown booking did not stay not found/,
    );
    expect(() => validateOwnerUnknownBookingNotFound(404, { error: "Not found" })).toThrow(
      /unknown booking did not stay not found/,
    );
  });

  it("requires owner unknown insurance claim writes to stay not found", () => {
    expect(() => validateOwnerUnknownClaimNotFound(404, { error: "Skadeärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownClaimNotFound(200, { success: true })).toThrow(
      /unknown insurance claim did not stay not found/,
    );
    expect(() => validateOwnerUnknownClaimNotFound(404, { error: "Skadeärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown insurance claim did not stay not found/,
    );
    expect(() => validateOwnerUnknownClaimNotFound(404, { error: "Not found" })).toThrow(
      /unknown insurance claim did not stay not found/,
    );
  });

  it("requires owner unknown energy reading writes to stay not found", () => {
    expect(() => validateOwnerUnknownEnergyNotFound(404, { error: "Avläsningen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownEnergyNotFound(200, { success: true })).toThrow(
      /unknown energy reading did not stay not found/,
    );
    expect(() => validateOwnerUnknownEnergyNotFound(404, { error: "Avläsningen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown energy reading did not stay not found/,
    );
    expect(() => validateOwnerUnknownEnergyNotFound(404, { error: "Not found" })).toThrow(
      /unknown energy reading did not stay not found/,
    );
  });

  it("requires owner unknown access credential writes to stay not found", () => {
    expect(() => validateOwnerUnknownAccessNotFound(404, { error: "Behörigheten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownAccessNotFound(200, { success: true })).toThrow(
      /unknown access credential did not stay not found/,
    );
    expect(() => validateOwnerUnknownAccessNotFound(404, { error: "Behörigheten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown access credential did not stay not found/,
    );
    expect(() => validateOwnerUnknownAccessNotFound(404, { error: "Not found" })).toThrow(
      /unknown access credential did not stay not found/,
    );
  });

  it("requires owner unknown IMD reading writes to stay not found", () => {
    expect(() => validateOwnerUnknownImdNotFound(404, { error: "Avläsningen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownImdNotFound(200, { success: true })).toThrow(
      /unknown IMD reading did not stay not found/,
    );
    expect(() => validateOwnerUnknownImdNotFound(404, { error: "Avläsningen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown IMD reading did not stay not found/,
    );
    expect(() => validateOwnerUnknownImdNotFound(404, { error: "Not found" })).toThrow(
      /unknown IMD reading did not stay not found/,
    );
  });

  it("requires owner unknown document writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownDocumentNotFound(404, { error: "Dokumentet hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownDocumentNotFound(200, { success: true })).toThrow(
      /unknown document did not stay not found/,
    );
    expect(() => validateOwnerUnknownDocumentNotFound(404, { error: "Dokumentet hittades inte" })).toThrow(
      /unknown document did not stay not found/,
    );
    expect(() => validateOwnerUnknownDocumentNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown document did not stay not found/,
    );
  });

  it("requires owner unknown operational document deletes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownOperationalDocumentNotFound(404, { error: "Dokumentet hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownOperationalDocumentNotFound(200, { success: true })).toThrow(
      /unknown operational document did not stay not found/,
    );
    expect(() => validateOwnerUnknownOperationalDocumentNotFound(404, { error: "Dokumentet hittades inte" })).toThrow(
      /unknown operational document did not stay not found/,
    );
    expect(() => validateOwnerUnknownOperationalDocumentNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown operational document did not stay not found/,
    );
  });

  it("requires owner unknown budget entry writes to stay not found", () => {
    expect(() => validateOwnerUnknownBudgetNotFound(404, { error: "Budgetraden hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownBudgetNotFound(200, { success: true })).toThrow(
      /unknown budget entry did not stay not found/,
    );
    expect(() => validateOwnerUnknownBudgetNotFound(404, { error: "Budgetraden hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown budget entry did not stay not found/,
    );
    expect(() => validateOwnerUnknownBudgetNotFound(404, { error: "Not found" })).toThrow(
      /unknown budget entry did not stay not found/,
    );
  });

  it("requires owner unknown lease holder writes to stay not found", () => {
    expect(() => validateOwnerUnknownLeaseHolderNotFound(404, { error: "Kontakten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseHolderNotFound(200, { success: true })).toThrow(
      /unknown lease holder did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHolderNotFound(404, { error: "Kontakten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease holder did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHolderNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease holder did not stay not found/,
    );
  });

  it("requires owner unknown rent notice writes to stay not found", () => {
    expect(() => validateOwnerUnknownRentNoticeNotFound(404, { error: "Hyresavin hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownRentNoticeNotFound(200, { success: true })).toThrow(
      /unknown rent notice did not stay not found/,
    );
    expect(() => validateOwnerUnknownRentNoticeNotFound(404, { error: "Hyresavin hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown rent notice did not stay not found/,
    );
    expect(() => validateOwnerUnknownRentNoticeNotFound(404, { error: "Not found" })).toThrow(
      /unknown rent notice did not stay not found/,
    );
  });

  it("requires owner unknown notification writes to stay not found", () => {
    expect(() => validateOwnerUnknownNotificationNotFound(404, { error: "Notisen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownNotificationNotFound(200, { success: true })).toThrow(
      /unknown notification did not stay not found/,
    );
    expect(() => validateOwnerUnknownNotificationNotFound(404, { error: "Notisen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown notification did not stay not found/,
    );
    expect(() => validateOwnerUnknownNotificationNotFound(404, { error: "Not found" })).toThrow(
      /unknown notification did not stay not found/,
    );
  });

  it("requires owner unknown maintenance item writes to stay not found", () => {
    expect(() => validateOwnerUnknownMaintenanceNotFound(404, { error: "Underhållsåtgärden hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownMaintenanceNotFound(200, { success: true })).toThrow(
      /unknown maintenance item did not stay not found/,
    );
    expect(() => validateOwnerUnknownMaintenanceNotFound(404, { error: "Underhållsåtgärden hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown maintenance item did not stay not found/,
    );
    expect(() => validateOwnerUnknownMaintenanceNotFound(404, { error: "Not found" })).toThrow(
      /unknown maintenance item did not stay not found/,
    );
  });

  it("requires owner unknown building writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownBuildingNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownBuildingNotFound(200, { success: true })).toThrow(
      /unknown building property did not stay not found/,
    );
    expect(() => validateOwnerUnknownBuildingNotFound(404, { error: "Fastigheten hittades inte" })).toThrow(
      /unknown building property did not stay not found/,
    );
    expect(() => validateOwnerUnknownBuildingNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown building property did not stay not found/,
    );
  });

  it("requires owner unknown unit writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownUnitNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownUnitNotFound(200, { success: true })).toThrow(
      /unknown unit property did not stay not found/,
    );
    expect(() => validateOwnerUnknownUnitNotFound(404, { error: "Fastigheten hittades inte" })).toThrow(
      /unknown unit property did not stay not found/,
    );
    expect(() => validateOwnerUnknownUnitNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown unit property did not stay not found/,
    );
  });

  it("requires owner unknown component writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownComponentNotFound(404, { error: "Komponenten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownComponentNotFound(200, { success: true })).toThrow(
      /unknown component did not stay not found/,
    );
    expect(() => validateOwnerUnknownComponentNotFound(404, { error: "Komponenten hittades inte" })).toThrow(
      /unknown component did not stay not found/,
    );
    expect(() => validateOwnerUnknownComponentNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown component did not stay not found/,
    );
  });

  it("requires owner unknown ticket restore writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketRestoreNotFound(404, { error: "Ärendet hittades inte eller är redan aktivt" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketRestoreNotFound(200, { success: true })).toThrow(
      /unknown ticket restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketRestoreNotFound(404, { error: "Ärendet hittades inte eller är redan aktivt", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketRestoreNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket restore did not stay not found/,
    );
  });

  it("requires owner unknown work-order restore writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderRestoreNotFound(404, { error: "Arbetsordern hittades inte eller är redan aktiv" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderRestoreNotFound(200, { success: true })).toThrow(
      /unknown work-order restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderRestoreNotFound(404, { error: "Arbetsordern hittades inte eller är redan aktiv", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderRestoreNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order restore did not stay not found/,
    );
  });

  it("requires owner unknown property restore writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownPropertyRestoreNotFound(404, { error: "Fastigheten hittades inte eller är redan aktiv", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownPropertyRestoreNotFound(200, { success: true })).toThrow(
      /unknown property restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyRestoreNotFound(404, { error: "Fastigheten hittades inte eller är redan aktiv" })).toThrow(
      /unknown property restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyRestoreNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown property restore did not stay not found/,
    );
  });

  it("requires owner unknown project restore writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownProjectRestoreNotFound(404, { error: "Projektet hittades inte eller är redan aktivt" })).not.toThrow();
    expect(() => validateOwnerUnknownProjectRestoreNotFound(200, { success: true })).toThrow(
      /unknown project restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectRestoreNotFound(404, { error: "Projektet hittades inte eller är redan aktivt", errorCode: "NOT_FOUND" })).toThrow(
      /unknown project restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectRestoreNotFound(404, { error: "Not found" })).toThrow(
      /unknown project restore did not stay not found/,
    );
  });

  it("requires owner unknown lease restore writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseRestoreNotFound(404, { error: "Avtalet hittades inte eller är redan aktivt" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseRestoreNotFound(200, { success: true })).toThrow(
      /unknown lease restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseRestoreNotFound(404, { error: "Avtalet hittades inte eller är redan aktivt", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseRestoreNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease restore did not stay not found/,
    );
  });

  it("requires owner unknown lease-holder restore writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseHolderRestoreNotFound(404, { error: "Kontakten hittades inte eller är redan aktiv" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseHolderRestoreNotFound(200, { success: true })).toThrow(
      /unknown lease-holder restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHolderRestoreNotFound(404, { error: "Kontakten hittades inte eller är redan aktiv", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease-holder restore did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHolderRestoreNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease-holder restore did not stay not found/,
    );
  });

  it("requires owner unknown ticket comment writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketCommentNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketCommentNotFound(200, { success: true })).toThrow(
      /unknown ticket comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketCommentNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketCommentNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket comment did not stay not found/,
    );
  });

  it("requires owner unknown work-order comment writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderCommentNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderCommentNotFound(200, { success: true })).toThrow(
      /unknown work-order comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderCommentNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderCommentNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order comment did not stay not found/,
    );
  });

  it("requires owner unknown project comment writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownProjectCommentNotFound(404, { error: "Projektet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownProjectCommentNotFound(200, { success: true })).toThrow(
      /unknown project comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectCommentNotFound(404, { error: "Projektet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown project comment did not stay not found/,
    );
    expect(() => validateOwnerUnknownProjectCommentNotFound(404, { error: "Not found" })).toThrow(
      /unknown project comment did not stay not found/,
    );
  });

  it("requires owner unknown work-order time-entry writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderTimeEntryNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderTimeEntryNotFound(200, { success: true })).toThrow(
      /unknown work-order time entry did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderTimeEntryNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order time entry did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderTimeEntryNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order time entry did not stay not found/,
    );
  });

  it("requires owner unknown work-order material writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderMaterialNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderMaterialNotFound(200, { success: true })).toThrow(
      /unknown work-order material did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderMaterialNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order material did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderMaterialNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order material did not stay not found/,
    );
  });

  it("requires owner unknown work-order execution writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderExecutionNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderExecutionNotFound(200, { success: true })).toThrow(
      /unknown work-order execution did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderExecutionNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order execution did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderExecutionNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order execution did not stay not found/,
    );
  });

  it("requires owner unknown ticket work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketWorkOrderNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown ticket work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketWorkOrderNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket work-order did not stay not found/,
    );
  });

  it("requires owner unknown inspection work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownInspectionWorkOrderNotFound(404, { error: "Kontrollen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownInspectionWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown inspection work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownInspectionWorkOrderNotFound(404, { error: "Kontrollen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown inspection work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownInspectionWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown inspection work-order did not stay not found/,
    );
  });

  it("requires owner unknown quote work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownQuoteWorkOrderNotFound(404, { error: "Offerten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownQuoteWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown quote work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownQuoteWorkOrderNotFound(404, { error: "Offerten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown quote work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownQuoteWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown quote work-order did not stay not found/,
    );
  });

  it("requires owner unknown insurance-claim work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownInsuranceClaimWorkOrderNotFound(404, { error: "Skadeärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownInsuranceClaimWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown insurance-claim work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownInsuranceClaimWorkOrderNotFound(404, { error: "Skadeärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown insurance-claim work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownInsuranceClaimWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown insurance-claim work-order did not stay not found/,
    );
  });

  it("requires owner unknown work-order project writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderProjectNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderProjectNotFound(200, { success: true })).toThrow(
      /unknown work-order project did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProjectNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order project did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProjectNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order project did not stay not found/,
    );
  });

  it("requires owner unknown round work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownRoundWorkOrderNotFound(404, { error: "Ronden hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownRoundWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown round work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownRoundWorkOrderNotFound(404, { error: "Ronden hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown round work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownRoundWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown round work-order did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrderNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown lease inspection work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrderNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease inspection work-order did not stay not found/,
    );
  });

  it("requires owner unknown work-order document writes to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownWorkOrderDocumentNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderDocumentNotFound(200, { success: true })).toThrow(
      /unknown work-order document did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderDocumentNotFound(404, { error: "Arbetsordern hittades inte" })).toThrow(
      /unknown work-order document did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderDocumentNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order document did not stay not found/,
    );
  });

  it("requires owner unknown ticket attachment writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketAttachmentNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketAttachmentNotFound(200, { success: true })).toThrow(
      /unknown ticket attachment did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketAttachmentNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket attachment did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketAttachmentNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket attachment did not stay not found/,
    );
  });

  it("requires owner unknown maintenance-plan work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownMaintenancePlanWorkOrderNotFound(404, { error: "Fastigheten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownMaintenancePlanWorkOrderNotFound(200, { success: true })).toThrow(
      /unknown maintenance-plan work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownMaintenancePlanWorkOrderNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown maintenance-plan work-order did not stay not found/,
    );
    expect(() => validateOwnerUnknownMaintenancePlanWorkOrderNotFound(404, { error: "Not found" })).toThrow(
      /unknown maintenance-plan work-order did not stay not found/,
    );
  });

  it("requires owner unknown work-order report writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderReportNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderReportNotFound(200, { success: true })).toThrow(
      /unknown work-order report did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderReportNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order report did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderReportNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order report did not stay not found/,
    );
  });

  it("requires owner unknown work-order SLA writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderSlaNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderSlaNotFound(200, { success: true })).toThrow(
      /unknown work-order SLA did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderSlaNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order SLA did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderSlaNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order SLA did not stay not found/,
    );
  });

  it("requires owner unknown work-order edit-lock writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderEditLockNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderEditLockNotFound(200, { success: true })).toThrow(
      /unknown work-order edit-lock did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderEditLockNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order edit-lock did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderEditLockNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order edit-lock did not stay not found/,
    );
  });

  it("requires owner unknown work-order invoice-basis writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisNotFound(200, { success: true })).toThrow(
      /unknown work-order invoice-basis did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order invoice-basis did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order invoice-basis did not stay not found/,
    );
  });

  it("requires owner unknown work-order profitability writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderProfitabilityNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderProfitabilityNotFound(200, { success: true })).toThrow(
      /unknown work-order profitability did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProfitabilityNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order profitability did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProfitabilityNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order profitability did not stay not found/,
    );
  });

  it("requires owner unknown work-order invoice-integration writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound(200, { success: true })).toThrow(
      /unknown work-order invoice-integration did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order invoice-integration did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order invoice-integration did not stay not found/,
    );
  });

  it("requires owner unknown work-order transitions reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderTransitionsNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderTransitionsNotFound(200, { success: true })).toThrow(
      /unknown work-order transitions did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderTransitionsNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order transitions did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderTransitionsNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order transitions did not stay not found/,
    );
  });

  it("requires owner unknown work-order invoice-basis reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound(200, { success: true })).toThrow(
      /unknown work-order invoice-basis GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order invoice-basis GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order invoice-basis GET did not stay not found/,
    );
  });

  it("requires owner unknown work-order invoice-basis export reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound(200, { success: true })).toThrow(
      /unknown work-order invoice-basis export did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order invoice-basis export did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order invoice-basis export did not stay not found/,
    );
  });

  it("requires owner unknown work-order profitability reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderProfitabilityGetNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderProfitabilityGetNotFound(200, { success: true })).toThrow(
      /unknown work-order profitability GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProfitabilityGetNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order profitability GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderProfitabilityGetNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order profitability GET did not stay not found/,
    );
  });

  it("requires owner unknown work-order invoice-integration reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound(200, { success: true })).toThrow(
      /unknown work-order invoice-integration GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order invoice-integration GET did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order invoice-integration GET did not stay not found/,
    );
  });

  it("requires owner unknown work-order asset-options reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderAssetOptionsNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderAssetOptionsNotFound(200, { success: true })).toThrow(
      /unknown work-order asset-options did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderAssetOptionsNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order asset-options did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderAssetOptionsNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order asset-options did not stay not found/,
    );
  });

  it("requires owner unknown work-order attestation writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderAttestationNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderAttestationNotFound(200, { success: true })).toThrow(
      /unknown work-order attestation did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderAttestationNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order attestation did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderAttestationNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order attestation did not stay not found/,
    );
  });

  it("requires owner unknown work-order locked-update writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderLockedUpdateNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderLockedUpdateNotFound(200, { success: true })).toThrow(
      /unknown work-order locked-update did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderLockedUpdateNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order locked-update did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderLockedUpdateNotFound(404, { error: "Not found" })).toThrow(
      /unknown work-order locked-update did not stay not found/,
    );
  });

  it("requires owner unknown work-order document item reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderDocumentItemNotFound(404, { error: "Arbetsordern hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderDocumentItemNotFound(200, { success: true })).toThrow(
      /unknown work-order document item did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderDocumentItemNotFound(404, { error: "Arbetsordern hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order document item did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderDocumentItemNotFound(404, { error: "Dokumentet hittades inte" })).toThrow(
      /unknown work-order document item did not stay not found/,
    );
  });

  it("requires owner unknown ticket operations reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketOperationsGetNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketOperationsGetNotFound(200, { success: true })).toThrow(
      /unknown ticket operations did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsGetNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket operations did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsGetNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket operations did not stay not found/,
    );
  });

  it("requires owner unknown ticket operations writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketOperationsPostNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketOperationsPostNotFound(200, { success: true })).toThrow(
      /unknown ticket operations write did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsPostNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket operations write did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsPostNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket operations write did not stay not found/,
    );
  });

  it("requires owner unknown ticket operations patches to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketOperationsPatchNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketOperationsPatchNotFound(200, { success: true })).toThrow(
      /unknown ticket operations patch did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsPatchNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket operations patch did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsPatchNotFound(404, { error: "Registreringen hittades inte" })).toThrow(
      /unknown ticket operations patch did not stay not found/,
    );
  });

  it("requires owner unknown ticket operations deletes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketOperationsDeleteNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketOperationsDeleteNotFound(200, { success: true })).toThrow(
      /unknown ticket operations delete did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsDeleteNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket operations delete did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketOperationsDeleteNotFound(404, { error: "Registreringen hittades inte" })).toThrow(
      /unknown ticket operations delete did not stay not found/,
    );
  });

  it("requires owner unknown ticket timeline reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketTimelineNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketTimelineNotFound(200, { success: true })).toThrow(
      /unknown ticket timeline did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketTimelineNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket timeline did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketTimelineNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket timeline did not stay not found/,
    );
  });

  it("requires owner unknown ticket SMS writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketSmsNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketSmsNotFound(200, { success: true })).toThrow(
      /unknown ticket SMS did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketSmsNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket SMS did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketSmsNotFound(400, { error: "Ärendet saknar telefonnummer" })).toThrow(
      /unknown ticket SMS did not stay not found/,
    );
  });

  it("requires owner unknown ticket AI writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownTicketAiNotFound(404, { error: "Ärendet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownTicketAiNotFound(200, { success: true })).toThrow(
      /unknown ticket AI did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketAiNotFound(404, { error: "Ärendet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown ticket AI did not stay not found/,
    );
    expect(() => validateOwnerUnknownTicketAiNotFound(404, { error: "Not found" })).toThrow(
      /unknown ticket AI did not stay not found/,
    );
  });

  it("requires owner unknown lease handover reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseHandoverNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseHandoverNotFound(200, { success: true })).toThrow(
      /unknown lease handover did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHandoverNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease handover did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHandoverNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease handover did not stay not found/,
    );
  });

  it("requires owner unknown lease handover writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseHandoverPutNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseHandoverPutNotFound(200, { success: true })).toThrow(
      /unknown lease handover write did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHandoverPutNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease handover write did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseHandoverPutNotFound(400, { error: "Välj inflyttning eller avflyttning" })).toThrow(
      /unknown lease handover write did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection-item reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionItemsNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionItemsNotFound(200, { success: true })).toThrow(
      /unknown lease inspection items did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemsNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection items did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemsNotFound(404, { error: "Not found" })).toThrow(
      /unknown lease inspection items did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection-item writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionItemsPutNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionItemsPutNotFound(200, { success: true })).toThrow(
      /unknown lease inspection items write did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemsPutNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection items write did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemsPutNotFound(400, { error: "Besiktningspunkter saknas" })).toThrow(
      /unknown lease inspection items write did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection-item work-order reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound(200, { success: true })).toThrow(
      /unknown lease inspection-item work-orders did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection-item work-orders did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound(404, { error: "En eller flera besiktningspunkter hittades inte" })).toThrow(
      /unknown lease inspection-item work-orders did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection-item work-order writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound(200, { success: true })).toThrow(
      /unknown lease inspection-item work-order writes did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection-item work-order writes did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound(409, { error: "Spara besiktningspunkterna innan arbetsorder skapas" })).toThrow(
      /unknown lease inspection-item work-order writes did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection work-order reconcile to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound(200, { success: true })).toThrow(
      /unknown lease inspection work-order reconcile did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection work-order reconcile did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound(400, { error: "Besiktningsversion saknas" })).toThrow(
      /unknown lease inspection work-order reconcile did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound(404, { error: "Ingen sparad besiktning hittades" })).toThrow(
      /unknown lease inspection work-order reconcile did not stay not found/,
    );
  });

  it("requires owner unknown lease inspection work-order status to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound(404, { error: "Avtalet hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound(200, { links: [] })).toThrow(
      /unknown lease inspection work-order status did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound(200, { success: true })).toThrow(
      /unknown lease inspection work-order status did not stay not found/,
    );
    expect(() => validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound(404, { error: "Avtalet hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown lease inspection work-order status did not stay not found/,
    );
  });

  it("requires owner unknown property card reads to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownPropertyCardNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownPropertyCardNotFound(200, { property: { id: "synthetic" } })).toThrow(
      /unknown property card did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyCardNotFound(200, { success: true })).toThrow(
      /unknown property card did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyCardNotFound(404, { error: "Fastigheten hittades inte" })).toThrow(
      /unknown property card did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyCardNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown property card did not stay not found/,
    );
  });

  it("requires owner unknown property component list reads to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownPropertyComponentsNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownPropertyComponentsNotFound(200, { assets: [] })).toThrow(
      /unknown property components did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyComponentsNotFound(200, { success: true })).toThrow(
      /unknown property components did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyComponentsNotFound(404, { error: "Fastigheten hittades inte" })).toThrow(
      /unknown property components did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyComponentsNotFound(404, { error: "Komponenten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown property components did not stay not found/,
    );
  });

  it("requires owner unknown property maintenance-plan reads to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownPropertyMaintenancePlanNotFound(404, { error: "Fastigheten hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownPropertyMaintenancePlanNotFound(200, { plans: [] })).toThrow(
      /unknown property maintenance plan did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyMaintenancePlanNotFound(200, { success: true })).toThrow(
      /unknown property maintenance plan did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyMaintenancePlanNotFound(404, { error: "Fastigheten hittades inte" })).toThrow(
      /unknown property maintenance plan did not stay not found/,
    );
    expect(() => validateOwnerUnknownPropertyMaintenancePlanNotFound(404, { error: "Not found", errorCode: "NOT_FOUND" })).toThrow(
      /unknown property maintenance plan did not stay not found/,
    );
  });

  it("requires owner unknown document download to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownDocumentDownloadNotFound(404, { error: "Dokumentet hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownDocumentDownloadNotFound(200, { success: true })).toThrow(
      /unknown document download did not stay not found/,
    );
    expect(() => validateOwnerUnknownDocumentDownloadNotFound(404, { error: "Dokumentet hittades inte" })).toThrow(
      /unknown document download did not stay not found/,
    );
    expect(() => validateOwnerUnknownDocumentDownloadNotFound(404, { error: "Dokumentfilen saknas", errorCode: "NOT_FOUND" })).toThrow(
      /unknown document download did not stay not found/,
    );
  });

  it("requires owner unknown attachment reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownAttachmentNotFound(404, { error: "Bilagan hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownAttachmentNotFound(200, { success: true })).toThrow(
      /unknown attachment did not stay not found/,
    );
    expect(() => validateOwnerUnknownAttachmentNotFound(404, { error: "Bilagan hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown attachment did not stay not found/,
    );
    expect(() => validateOwnerUnknownAttachmentNotFound(404, { error: "Bilagan hittades inte i fillagringen" })).toThrow(
      /unknown attachment did not stay not found/,
    );
    expect(() => validateOwnerUnknownAttachmentNotFound(404, { error: "Ärendet hittades inte" })).toThrow(
      /unknown attachment did not stay not found/,
    );
  });

  it("requires owner unknown work-order report item reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownWorkOrderReportItemNotFound(404, { error: "Rapporten hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownWorkOrderReportItemNotFound(200, { report: { id: "report-1" } })).toThrow(
      /unknown work-order report item did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderReportItemNotFound(200, { success: true })).toThrow(
      /unknown work-order report item did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderReportItemNotFound(404, { error: "Rapporten hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown work-order report item did not stay not found/,
    );
    expect(() => validateOwnerUnknownWorkOrderReportItemNotFound(404, { error: "Arbetsordern hittades inte" })).toThrow(
      /unknown work-order report item did not stay not found/,
    );
  });

  it("requires owner unknown IMD attach-notice writes to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownImdAttachNoticeNotFound(404, { error: "Avläsningen hittades inte" })).not.toThrow();
    expect(() => validateOwnerUnknownImdAttachNoticeNotFound(200, { success: true })).toThrow(
      /unknown IMD attach-notice did not stay not found/,
    );
    expect(() => validateOwnerUnknownImdAttachNoticeNotFound(404, { error: "Avläsningen hittades inte", errorCode: "NOT_FOUND" })).toThrow(
      /unknown IMD attach-notice did not stay not found/,
    );
    expect(() => validateOwnerUnknownImdAttachNoticeNotFound(404, { error: "Hyresavin hittades inte" })).toThrow(
      /unknown IMD attach-notice did not stay not found/,
    );
    expect(() => validateOwnerUnknownImdAttachNoticeNotFound(400, { error: "Välj en befintlig hyresavi eller skapa en ny" })).toThrow(
      /unknown IMD attach-notice did not stay not found/,
    );
  });

  it("requires owner unknown operational document download to stay not found with leftover NOT_FOUND", () => {
    expect(() => validateOwnerUnknownOperationalDocumentDownloadNotFound(404, { error: "Dokumentet hittades inte", errorCode: "NOT_FOUND" })).not.toThrow();
    expect(() => validateOwnerUnknownOperationalDocumentDownloadNotFound(200, { success: true })).toThrow(
      /unknown operational document download did not stay not found/,
    );
    expect(() => validateOwnerUnknownOperationalDocumentDownloadNotFound(404, { error: "Dokumentet hittades inte" })).toThrow(
      /unknown operational document download did not stay not found/,
    );
    expect(() => validateOwnerUnknownOperationalDocumentDownloadNotFound(404, { error: "Dokumentet hittades inte i fillagringen", errorCode: "NOT_FOUND" })).toThrow(
      /unknown operational document download did not stay not found/,
    );
  });

  it("requires owner unknown public ticket reads to stay not found without leftover errorCode", () => {
    expect(() => validateOwnerUnknownPublicTicketNotFound(404, { error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." })).not.toThrow();
    expect(() => validateOwnerUnknownPublicTicketNotFound(200, { ticket: { public_reference: "RV-E2E" } })).toThrow(
      /unknown public ticket did not stay not found/,
    );
    expect(() => validateOwnerUnknownPublicTicketNotFound(200, { success: true })).toThrow(
      /unknown public ticket did not stay not found/,
    );
    expect(() => validateOwnerUnknownPublicTicketNotFound(404, { error: "Ärendet hittades inte. Kontrollera referensnummer och e-post.", errorCode: "NOT_FOUND" })).toThrow(
      /unknown public ticket did not stay not found/,
    );
    expect(() => validateOwnerUnknownPublicTicketNotFound(400, { error: "Referensnummer och e-post eller spårningstoken krävs" })).toThrow(
      /unknown public ticket did not stay not found/,
    );
    expect(() => validateOwnerUnknownPublicTicketNotFound(404, { error: "Ärendet hittades inte" })).toThrow(
      /unknown public ticket did not stay not found/,
    );
  });

  it.each([
    { company_id: "company-b" }, { company: { id: "company-b", status: "active" } },
    { company_id: null }, { company: null }, { company: { id: fixture.companyId, status: "suspended" } },
    { email_verified_at: null }, { email_verified_at: "invalid" },
    { role: "resident" }, { role: "unknown" }, { status: "inactive" }, { email: "other@example.com" },
  ])("rejects an unverified, inactive or wrongly scoped account: %j", (change) => {
    expect(() => validateFixtureProfile(200, { user: { ...user, ...change } }, fixture)).toThrow();
  });

  it("does not accept a missing expected company or an unsuccessful profile response", () => {
    expect(() => validateFixtureProfile(200, { user }, { ...fixture, companyId: "" })).toThrow();
    expect(() => validateFixtureProfile(401, { user }, fixture)).toThrow();
  });

  it("runs owner billing Preview proof inside verified login without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    expect(runner).toContain("validateOwnerBillingPreviewDirectPlan");
    expect(runner).toContain("validateOwnerBillingPlanRegistry");
    expect(runner).toContain("validateOwnerBillingStripeReadiness");
    expect(runner).toContain("validateOwnerBillingStripePortalReady");
    expect(runner).toContain("validateOwnerBillingPreviewPlanChanged");
    expect(runner).toContain("validateOwnerBillingPreviewInvalidPlan");
    expect(runner).toContain("validateOwnerOnboardingEligible");
    expect(runner).toContain("validateOwnerOnboardingVerified");
    expect(runner).toContain("validateOwnerIntegrationsReadable");
    expect(runner).toContain("validateOwnerCompanyManageable");
    expect(runner).toContain("validateOwnerAuditReadable");
    expect(runner).toContain("validateOwnerOperationsReadable");
    expect(runner).toContain("validateOwnerAssignQueueReadable");
    expect(runner).toContain("validateOwnerLockBoardForceRelease");
    expect(runner).toContain("validateOwnerUnknownPropertyNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseNotFound");
    expect(runner).toContain("validateOwnerUnknownProjectNotFound");
    expect(runner).toContain("validateOwnerUnknownInspectionNotFound");
    expect(runner).toContain("validateOwnerUnknownCalendarNotFound");
    expect(runner).toContain("validateOwnerUnknownTeamMemberNotFound");
    expect(runner).toContain("validateOwnerUnknownRoundNotFound");
    expect(runner).toContain("validateOwnerUnknownVendorNotFound");
    expect(runner).toContain("validateOwnerUnknownQuoteNotFound");
    expect(runner).toContain("validateOwnerUnknownChecklistNotFound");
    expect(runner).toContain("validateOwnerUnknownBookingNotFound");
    expect(runner).toContain("validateOwnerUnknownClaimNotFound");
    expect(runner).toContain("validateOwnerUnknownEnergyNotFound");
    expect(runner).toContain("validateOwnerUnknownAccessNotFound");
    expect(runner).toContain("validateOwnerUnknownImdNotFound");
    expect(runner).toContain("validateOwnerUnknownDocumentNotFound");
    expect(runner).toContain("validateOwnerUnknownOperationalDocumentNotFound");
    expect(runner).toContain("validateOwnerUnknownBudgetNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseHolderNotFound");
    expect(runner).toContain("validateOwnerUnknownRentNoticeNotFound");
    expect(runner).toContain("validateOwnerUnknownNotificationNotFound");
    expect(runner).toContain("validateOwnerUnknownMaintenanceNotFound");
    expect(runner).toContain("validateOwnerUnknownBuildingNotFound");
    expect(runner).toContain("validateOwnerUnknownUnitNotFound");
    expect(runner).toContain("validateOwnerUnknownComponentNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownPropertyRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownProjectRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseHolderRestoreNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketCommentNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderCommentNotFound");
    expect(runner).toContain("validateOwnerUnknownProjectCommentNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderTimeEntryNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderMaterialNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderExecutionNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownInspectionWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownQuoteWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownInsuranceClaimWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderProjectNotFound");
    expect(runner).toContain("validateOwnerUnknownRoundWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderDocumentNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketAttachmentNotFound");
    expect(runner).toContain("validateOwnerUnknownMaintenancePlanWorkOrderNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderReportNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderSlaNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderEditLockNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderInvoiceBasisNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderProfitabilityNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderInvoiceIntegrationNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderTransitionsNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderInvoiceBasisGetNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderInvoiceBasisExportNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderProfitabilityGetNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderInvoiceIntegrationGetNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderAssetOptionsNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderAttestationNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderLockedUpdateNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderDocumentItemNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketOperationsGetNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketOperationsPostNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketOperationsPatchNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketOperationsDeleteNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketTimelineNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketSmsNotFound");
    expect(runner).toContain("validateOwnerUnknownTicketAiNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseHandoverNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseHandoverPutNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionItemsNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionItemsPutNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionItemWorkOrdersGetNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionItemWorkOrdersPostNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionWorkOrdersReconcileNotFound");
    expect(runner).toContain("validateOwnerUnknownLeaseInspectionWorkOrdersStatusNotFound");
    expect(runner).toContain("validateOwnerUnknownPropertyCardNotFound");
    expect(runner).toContain("validateOwnerUnknownPropertyComponentsNotFound");
    expect(runner).toContain("validateOwnerUnknownPropertyMaintenancePlanNotFound");
    expect(runner).toContain("validateOwnerUnknownDocumentDownloadNotFound");
    expect(runner).toContain("validateOwnerUnknownAttachmentNotFound");
    expect(runner).toContain("validateOwnerUnknownWorkOrderReportItemNotFound");
    expect(runner).toContain("validateOwnerUnknownImdAttachNoticeNotFound");
    expect(runner).toContain("validateOwnerUnknownOperationalDocumentDownloadNotFound");
    expect(runner).toContain("validateOwnerUnknownPublicTicketNotFound");
    expect(runner).toContain("/api/billing");
    expect(runner).toContain("/api/onboarding");
    expect(runner).toContain("/api/integrations");
    expect(runner).toContain("/api/settings/company");
    expect(runner).toContain("/api/audit");
    expect(runner).toContain("/api/work-orders/recurring");
    expect(runner).toContain("/api/work-orders/unassigned-queue");
    expect(runner).toContain("/api/work-orders/edit-locks");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000001");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000002");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000003");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000004");
    expect(runner).toContain("/api/projects/00000000-0000-4000-8000-000000000005");
    expect(runner).toContain("/api/inspections/00000000-0000-4000-8000-000000000006");
    expect(runner).toContain("/api/calendar");
    expect(runner).toContain("00000000-0000-4000-8000-000000000007");
    expect(runner).toContain("/api/team/00000000-0000-4000-8000-000000000008");
    expect(runner).toContain("/api/rounds/00000000-0000-4000-8000-000000000009");
    expect(runner).toContain("/api/vendors");
    expect(runner).toContain("00000000-0000-4000-8000-000000000010");
    expect(runner).toContain("/api/quotes");
    expect(runner).toContain("00000000-0000-4000-8000-000000000011");
    expect(runner).toContain("/api/round-checklists/00000000-0000-4000-8000-000000000012");
    expect(runner).toContain("/api/bookings");
    expect(runner).toContain("00000000-0000-4000-8000-000000000013");
    expect(runner).toContain("/api/insurance-claims");
    expect(runner).toContain("00000000-0000-4000-8000-000000000014");
    expect(runner).toContain("/api/energy");
    expect(runner).toContain("00000000-0000-4000-8000-000000000015");
    expect(runner).toContain("/api/access-credentials");
    expect(runner).toContain("00000000-0000-4000-8000-000000000016");
    expect(runner).toContain("/api/imd-readings");
    expect(runner).toContain("00000000-0000-4000-8000-000000000017");
    expect(runner).toContain("/api/documents");
    expect(runner).toContain("00000000-0000-4000-8000-000000000018");
    expect(runner).toContain("/api/operational-documents/00000000-0000-4000-8000-000000000019");
    expect(runner).toContain("/api/budget");
    expect(runner).toContain("00000000-0000-4000-8000-000000000020");
    expect(runner).toContain("/api/lease-holders/00000000-0000-4000-8000-000000000021");
    expect(runner).toContain("/api/rent-notices");
    expect(runner).toContain("00000000-0000-4000-8000-000000000022");
    expect(runner).toContain("/api/notifications");
    expect(runner).toContain("00000000-0000-4000-8000-000000000023");
    expect(runner).toContain("/api/maintenance");
    expect(runner).toContain("00000000-0000-4000-8000-000000000024");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000025/buildings");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000026/units");
    expect(runner).toContain("/components/00000000-0000-4000-8000-000000000027");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000028/restore");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000029/restore");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000030/restore");
    expect(runner).toContain("/api/projects/00000000-0000-4000-8000-000000000031/restore");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000032/restore");
    expect(runner).toContain("/api/lease-holders/00000000-0000-4000-8000-000000000033/restore");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000034/comments");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000035/comments");
    expect(runner).toContain("/api/projects/00000000-0000-4000-8000-000000000036/comments");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000037/time-entries");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000038/materials");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000039/execution");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000040/work-order");
    expect(runner).toContain("/api/inspections/00000000-0000-4000-8000-000000000041/work-order");
    expect(runner).toContain("/api/quotes/00000000-0000-4000-8000-000000000042/work-order");
    expect(runner).toContain("/api/insurance-claims/00000000-0000-4000-8000-000000000043/work-order");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000044/project");
    expect(runner).toContain("/api/rounds/00000000-0000-4000-8000-000000000045/work-orders");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000046/inspection-work-orders");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000047/documents");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000048/attachments");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000049/maintenance-plan/action/work-order");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000050/reports");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000051/sla");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000052/edit-lock");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000053/invoice-basis");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000054/profitability");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000055/invoice-integration");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000056/transitions");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000057/invoice-basis");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000058/invoice-basis/export?format=json");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000059/profitability");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000060/invoice-integration");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000061/asset-options");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000062/attestation");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000063/locked-update");
    expect(runner).toContain("/api/work-orders/00000000-0000-4000-8000-000000000064/documents/00000000-0000-4000-8000-000000000164");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000065/operations");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000066/operations");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000067/operations");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000068/operations");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000069/timeline");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000070/sms");
    expect(runner).toContain("/api/tickets/00000000-0000-4000-8000-000000000071/ai");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000072/handover");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000073/handover");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000074/inspection-items");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000075/inspection-items");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000076/inspection-items/work-orders");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000077/inspection-items/work-orders");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000078/inspection-work-orders/reconcile");
    expect(runner).toContain("/api/leases/00000000-0000-4000-8000-000000000079/inspection-work-orders/status");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000080/card");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000081/components");
    expect(runner).toContain("/api/properties/00000000-0000-4000-8000-000000000082/maintenance-plan");
    expect(runner).toContain("/api/documents/00000000-0000-4000-8000-000000000083/download");
    expect(runner).toContain("/api/attachments/00000000-0000-4000-8000-000000000084");
    expect(runner).toContain("/api/work-order-reports/00000000-0000-4000-8000-000000000085");
    expect(runner).toContain("/api/imd-readings/00000000-0000-4000-8000-000000000086/attach-notice");
    expect(runner).toContain("/api/operational-documents/00000000-0000-4000-8000-000000000087/download");
    expect(runner).toContain("/api/public/tickets/00000000-0000-4000-8000-000000000088?email=e2e-unknown-public-ticket@example.com");
    expect(runner).toContain("createNotice: true");
    expect(runner).toContain('itemIds: ["e2e-unknown-inspection-item"]');
    expect(runner).toContain('component: "unknown lease inspection items"');
    expect(runner).toContain('generalNote: "E2E unknown lease handover"');
    expect(runner).toContain('message: "E2E unknown ticket SMS"');
    expect(runner).toContain('reason: "E2E unknown ticket AI"');
    expect(runner).toContain("00000000-0000-4000-8000-000000000167");
    expect(runner).toContain("00000000-0000-4000-8000-000000000168");
    expect(runner).toContain('type: "note"');
    expect(runner).toContain('editToken: "e2e-locked-update"');
    expect(runner).toContain('action: "approveSubmitted"');
    expect(runner).toContain('action: "rebuild"');
    expect(runner).toContain("patchOwnerBillingPlan");
    expect(runner).toContain('patchOwnerBillingPlan("unlimited")');
    expect(runner).toContain('action: "verify-ticket-intake"');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
  });

  it("only treats the Fastigheter list contract as paginated property navigation", () => {
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/properties?page=1&pageSize=10")).toBe(true);
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/properties")).toBe(false);
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/search?q=fastighet")).toBe(false);
  });

  it("accepts a real empty property list but rejects error fallbacks and malformed pagination", () => {
    const body = { properties: [], pagination: { total: 0 } };
    expect(() => validatePropertiesResponse(200, body)).not.toThrow();
    expect(() => validatePropertiesResponse(503, body)).toThrow();
    expect(() => validatePropertiesResponse(200, {})).toThrow();
    expect(() => validatePropertiesResponse(200, { ...body, pagination: { total: -1 } })).toThrow();
    expect(() => validatePropertiesResponse(200, { properties: [{ id: "synthetic" }], pagination: { total: 0 } })).toThrow();
  });

  it("never counts an API failure or malformed body as a successful empty search", () => {
    expect(() => validateEmptySearchResponse(200, { results: [] })).not.toThrow();
    for (const status of [401, 403, 429, 500]) {
      expect(() => validateEmptySearchResponse(status, { results: [] })).toThrow();
    }
    expect(() => validateEmptySearchResponse(200, {})).toThrow();
    expect(() => validateEmptySearchResponse(200, { results: [{ id: "unexpected" }] })).toThrow();
  });

  it("does not echo response content or fixture credentials in diagnostic errors", () => {
    const sensitive = "sensitive-fixture-value";
    try {
      validateFixtureProfile(200, { user: { email: sensitive, password: sensitive } }, { email: sensitive, companyId: sensitive });
      throw new Error("validator unexpectedly passed");
    } catch (error) {
      expect(String(error)).toContain("Fixture must be");
      expect(String(error)).not.toContain(sensitive);
    }
  });
});

describe("sanitizePreviewFailure", () => {
  it("keeps allowlisted diagnostics and drops unknown payload-bearing messages", () => {
    expect(sanitizePreviewFailure(new Error("Verified login response was not observed"))).toContain("Verified login");
    expect(sanitizePreviewFailure(new Error("BLOCKED: release identity changed or became unverifiable"))).toContain("release identity");
    expect(sanitizePreviewFailure(new Error("BLOCKED: Preview schema is not ready for this release"))).toContain("schema is not ready");
    expect(sanitizePreviewFailure(new Error("BLOCKED: Preview data-plane isolation is not ready for this release"))).toContain("data-plane isolation");
    expect(sanitizePreviewFailure(new Error("Work-order edit lock was not acquired (423)"))).toContain("edit lock");
    expect(sanitizePreviewFailure(new Error("Time entry create did not persist as submitted (503:SERVICE_UNAVAILABLE)"))).toContain("503:SERVICE_UNAVAILABLE");
    expect(sanitizePreviewFailure(new Error("register POST did not produce a response (network failure: net::ERR_ABORTED)"))).toContain("did not produce a response");
    expect(sanitizePreviewFailure(new Error("register mutation was blocked by release identity verification"))).toContain("release identity");
    expect(sanitizePreviewFailure(new Error("timeout at https://secret.example/login?token=abc user@example.com"))).toBe(
      "Preview verification failed; no release approval. Check target, fixtures and required browser steps.",
    );
  });

  it("maps Playwright timeouts without leaking locators", () => {
    expect(sanitizePreviewFailure(new Error('Timeout 20000ms exceeded while waiting for event "response"'))).toBe(
      "A required browser event timed out",
    );
  });
});
