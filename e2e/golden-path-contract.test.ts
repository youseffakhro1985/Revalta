import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("golden-path contract", () => {
  it("accepts a persisted property, ticket and planned work order", () => {
    validateCreatedProperty(201, { property: { id: "property-1" } });
    validateCreatedTicket(201, { ticket: { id: "ticket-1", property: { id: "property-1" } } }, "property-1");
    validateTicketStatus(200, { ticket: { status: "new", property: { id: "property-1" } } }, "new", "property-1");
    expect(validateWorkOrderFromTicket(201, { workOrderId: "wo-1" }, true)).toBe("wo-1");
    expect(validateWorkOrderFromTicket(200, { workOrder: { id: "wo-2" }, canCreate: false }, true)).toBe("wo-2");
    expect(validateWorkOrderFromTicket(500, { errorCode: "INTERNAL_ERROR" }, true, {
      probed: true,
      existing: true,
      workOrderId: "wo-3",
    })).toBe("wo-3");
    validateWorkOrderStatus(200, { workOrder: { status: "planned", ticket: { id: "ticket-1" } } }, "planned", "ticket-1");
  });

  it("accepts attested time/material, comment, invoice ready and logout 401", () => {
    validateTimeEntryCreated(201, { entry: { entryId: "time-1", status: "submitted" } });
    validateTimeEntryApproved(201, { entry: { entryId: "time-1", status: "approved" } });
    validateMaterialCreated(201, { material: { entryId: "mat-1", status: "submitted" } });
    validateMaterialApproved(201, { material: { entryId: "mat-1", status: "approved" } });
    validateWorkOrderComment(201, { comment: { id: "c-1" } });
    validateInvoiceDraftRebuilt(201, { draft: { status: "draft", lines: [{ id: "l-1" }] } });
    validateInvoiceDraftReady(201, { draft: { status: "ready" } });
    validateInvoiceDraftReadyState(200, { draft: { status: "ready" } });
    expect(validateWorkOrderLockAcquired(201, { lock: { token: "tok", version: "2026-09-22T00:00:00.000Z" } })).toEqual({
      token: "tok",
      version: "2026-09-22T00:00:00.000Z",
    });
    validateLockedStatusChange(200, { workOrder: { status: "in_progress" } }, "in_progress");
    validateUnauthenticatedTicket(401);
    validateForbiddenReplay(409);
    validateWorkOrderAuditHistory(200, { history: [{ action: "work_order.updated" }] });
  });

  it("rejects missing ids and wrong lifecycle without leaking payloads", () => {
    expect(() => validateCreatedProperty(200, { property: { id: "property-1" } })).toThrow(/did not persist \(200:none\)/);
    expect(() => validateTicketStatus(200, { ticket: { status: "closed", property: { id: "property-1" } } }, "in_progress", "property-1")).toThrow(/expected synced status \(200:none\)/);
    expect(() => validateWorkOrderStatus(200, { workOrder: { status: "in_progress", ticket: { id: "other" } } }, "in_progress", "ticket-1")).toThrow(/lifecycle status \(200:none;missing=none\)/);
    expect(() => validateWorkOrderFromTicket(500, {}, true)).toThrow(/did not resolve to a work order \(500:none;existing=unchecked;missing=none\)/);
    expect(() => validateWorkOrderFromTicket(503, { errorCode: "SERVICE_UNAVAILABLE" }, true, { probed: true, existing: false })).toThrow(
      /did not resolve to a work order \(503:SERVICE_UNAVAILABLE;existing=no;missing=none\)/,
    );
    expect(() => validateWorkOrderFromTicket(503, { errorCode: "SERVICE_UNAVAILABLE", missing: "WorkOrder.sla_status" }, true, { probed: true, existing: false })).toThrow(
      /did not resolve to a work order \(503:SERVICE_UNAVAILABLE;existing=no;missing=WorkOrder\.sla_status\)/,
    );
    expect(() => validateWorkOrderFromTicket(503, { errorCode: "SERVICE_UNAVAILABLE", missing: "drop table tickets" }, true, { probed: true, existing: false })).toThrow(
      /did not resolve to a work order \(503:SERVICE_UNAVAILABLE;existing=no;missing=none\)/,
    );
    expect(() => validateWorkOrderFromTicket(500, { errorCode: "INTERNAL_ERROR" }, true)).toThrow(
      /did not resolve to a work order \(500:INTERNAL_ERROR;existing=unchecked;missing=none\)/,
    );
    expect(() => validateWorkOrderFromTicket(500, { errorCode: "drop table tickets" }, true)).toThrow(
      /did not resolve to a work order \(500:none;existing=unchecked;missing=none\)/,
    );
    expect(() => validateWorkOrderFromTicket(200, { workOrder: null, canCreate: true }, true, { probed: true, existing: false })).toThrow(
      /did not resolve to a work order \(200:get_payload;existing=no;missing=none\)/,
    );
    expect(() => validateWorkOrderFromTicket(307, null, true, { probed: true, existing: true })).toThrow(
      /did not resolve to a work order \(307:redirect;existing=yes;missing=none\)/,
    );
    expect(() => validateUnauthenticatedTicket(200)).toThrow(/after logout/);
    expect(() => validateForbiddenReplay(200)).toThrow(/illegal in_progress transition \(200:none\)/);
    expect(() => validateWorkOrderAuditHistory(200, { history: [] })).toThrow(/audit history.*\(200:none\)/);
    expect(() => validateTimeEntryCreated(503, { errorCode: "SERVICE_UNAVAILABLE" })).toThrow(
      /did not persist as submitted \(503:SERVICE_UNAVAILABLE\)/,
    );
    expect(() => validateWorkOrderLockAcquired(500, { errorCode: "drop table locks" })).toThrow(
      /lock was not acquired \(500:none\)/,
    );
    expect(() => validateLockedStatusChange(423, { errorCode: "CONFLICT" }, "in_progress")).toThrow(
      /did not enter in_progress \(423:CONFLICT;missing=none\)/,
    );
    expect(() => validateLockedStatusChange(409, { code: "invoice_draft_not_ready" }, "invoiced")).toThrow(
      /did not enter invoiced \(409:invoice_draft_not_ready;missing=none\)/,
    );
    expect(() => validateLockedStatusChange(409, { code: "version_conflict" }, "invoiced")).toThrow(
      /did not enter invoiced \(409:version_conflict;missing=none\)/,
    );
    expect(() => validateInvoiceDraftReadyState(200, { draft: { status: "draft" } })).toThrow(
      /not ready for invoicing \(200:none\)/,
    );
    expect(() => validateInvoiceDraftRebuilt(500, { errorCode: "INTERNAL_ERROR" })).toThrow(
      /not rebuilt from attested rows \(500:INTERNAL_ERROR\)/,
    );
  });
});

describe("golden-path is wired into the required Preview browser job", () => {
  it("requires both staff lifecycle and mobile work-order steps", () => {
    expect(REQUIRED_STEPS).toContain("golden-path-ticket-to-invoice");
    expect(REQUIRED_STEPS).toContain("golden-path-mobile-work-order");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    expect(runner).toContain("runStaffGoldenPath");
    expect(runner).toContain("assertTicketHiddenAfterLogout");
    expect(runner).toContain('complete("golden-path-ticket-to-invoice")');
    expect(runner).toContain('complete("golden-path-mobile-work-order")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    const golden = readFileSync(new URL("./golden-path.mjs", import.meta.url), "utf8");
    expect(golden).toContain("hoursAgo");
    expect(golden).toContain("/locked-update");
    expect(golden).toContain('redirect: "manual"');
    expect(golden).toContain("existingWorkOrder");
    expect(golden).toContain("workOrderId: existingWorkOrder");
    expect(golden).toContain("validateWorkOrderLockAcquired");
    expect(golden).toContain("validateLockedStatusChange");
    expect(golden).toContain("validateInvoiceDraftReadyState");
    expect(golden).toContain("/invoice-basis");
    expect(golden).toContain('workOrderId, "invoiced"');
    expect(golden).toContain("#work-order-title");
    expect(golden).toContain("#work-order-execution-material");
    expect(golden).toContain("scrollIntoViewIfNeeded");
    expect(golden).toContain("patchLockedStatus");
    expect(golden).toContain("isLockLost");
    const workOrderUi = golden.indexOf("/dashboard/arbetsorder/${workOrderId}");
    const leaveWorkOrderUi = golden.indexOf('goto("/dashboard"');
    const completedPatch = golden.indexOf('workOrderId, "completed"');
    expect(workOrderUi).toBeGreaterThan(-1);
    expect(leaveWorkOrderUi).toBeGreaterThan(workOrderUi);
    expect(completedPatch).toBeGreaterThan(leaveWorkOrderUi);
    expect(golden).not.toContain("page.route");
    expect(runner).toContain("staffUserId");
  });
});
