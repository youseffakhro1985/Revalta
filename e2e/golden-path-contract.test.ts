import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateCreatedProperty,
  validateCreatedTicket,
  validateForbiddenReplay,
  validateInvoiceDraftReady,
  validateInvoiceDraftRebuilt,
  validateMaterialApproved,
  validateMaterialCreated,
  validateTicketStatus,
  validateTimeEntryApproved,
  validateTimeEntryCreated,
  validateUnauthenticatedTicket,
  validateWorkOrderAuditHistory,
  validateWorkOrderComment,
  validateWorkOrderFromTicket,
  validateWorkOrderStatus,
} from "./golden-path-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("golden-path contract", () => {
  it("accepts a persisted property, ticket and planned work order", () => {
    validateCreatedProperty(201, { property: { id: "property-1" } });
    validateCreatedTicket(201, { ticket: { id: "ticket-1", property: { id: "property-1" } } }, "property-1");
    validateTicketStatus(200, { ticket: { status: "new", property: { id: "property-1" } } }, "new", "property-1");
    validateWorkOrderFromTicket(201, { workOrderId: "wo-1" }, true);
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
    validateUnauthenticatedTicket(401);
    validateForbiddenReplay(409);
    validateWorkOrderAuditHistory(200, { history: [{ action: "work_order.updated" }] });
  });

  it("rejects missing ids and wrong lifecycle without leaking payloads", () => {
    expect(() => validateCreatedProperty(200, { property: { id: "property-1" } })).toThrow(/did not persist/);
    expect(() => validateTicketStatus(200, { ticket: { status: "closed", property: { id: "property-1" } } }, "in_progress", "property-1")).toThrow(/expected synced status/);
    expect(() => validateWorkOrderStatus(200, { workOrder: { status: "in_progress", ticket: { id: "other" } } }, "in_progress", "ticket-1")).toThrow(/lifecycle status/);
    expect(() => validateUnauthenticatedTicket(200)).toThrow(/after logout/);
    expect(() => validateForbiddenReplay(200)).toThrow(/illegal in_progress/);
    expect(() => validateWorkOrderAuditHistory(200, { history: [] })).toThrow(/audit history/);
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
    expect(golden).not.toContain("page.route");
  });
});
