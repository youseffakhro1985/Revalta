import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  REQUIRED_OPERATIONAL_COLUMNS,
  REQUIRED_OPERATIONAL_TABLES,
  formatSchemaMissing,
  formatSchemaMissingItem,
  isMissingSchemaColumnError,
  isMissingTableError,
  schemaGapFromError,
  schemaCompatibilityBannerMessage,
  schemaMismatchUserMessage,
  canRenderHomeDashboard,
  ticketAiSourceSelect,
  ticketAiSourceWrite,
  workOrderVendorIdSelect,
  workOrderVendorRelationSelect,
  workOrderVendorWrite,
} from "@/lib/schema-readiness";

describe("schema-readiness", () => {
  it("detects Prisma P2022 missing-column errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Column not found", {
      code: "P2022",
      clientVersion: "test",
      meta: { column: "Property.deleted_at" },
    });
    expect(isMissingSchemaColumnError(error)).toBe(true);
  });

  it("detects raw-query missing-column errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `42703`. Message: `column "deleted_at" does not exist`',
      {
        code: "P2010",
        clientVersion: "test",
        meta: { code: "42703", message: 'column "deleted_at" does not exist' },
      },
    );
    expect(isMissingSchemaColumnError(error)).toBe(true);
  });

  it("does not treat missing tables as missing columns", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "The table `public.InsuranceClaim` does not exist in the current database.",
      {
        code: "P2021",
        clientVersion: "test",
        meta: { table: "public.InsuranceClaim" },
      },
    );
    expect(isMissingSchemaColumnError(error)).toBe(false);
    expect(isMissingTableError(error, "InsuranceClaim")).toBe(true);
  });

  it("extracts allowlisted table.column gaps without leaking raw messages", () => {
    const columnError = new Prisma.PrismaClientKnownRequestError("Column not found", {
      code: "P2022",
      clientVersion: "test",
      meta: { column: "WorkOrder.work_order_number" },
    });
    expect(schemaGapFromError(columnError)).toBe("WorkOrder.work_order_number");
    expect(
      schemaGapFromError(
        new Prisma.PrismaClientKnownRequestError(
          "The table `public.WorkOrderNumberCounter` does not exist in the current database.",
          {
            code: "P2021",
            clientVersion: "test",
            meta: { table: "public.WorkOrderNumberCounter" },
          },
        ),
      ),
    ).toBe("WorkOrderNumberCounter");
    expect(schemaGapFromError(new Error('column "sla_status" of relation "WorkOrder" does not exist'))).toBe(
      "WorkOrder.sla_status",
    );
    expect(schemaGapFromError(new Error("drop table tickets; --"))).toBe("");
  });

  it("ignores unrelated Prisma errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(isMissingSchemaColumnError(error)).toBe(false);
    expect(isMissingSchemaColumnError(new Error("boom"))).toBe(false);
  });

  it("returns actionable Swedish operator messages", () => {
    expect(schemaMismatchUserMessage()).toMatch(/Database Release/);
    expect(schemaMismatchUserMessage()).toMatch(/migrate deploy/);
    expect(schemaCompatibilityBannerMessage()).toMatch(/kompatibilitetsläge|utan soft-delete/i);
  });

  it("probes operational tables that 500 staff APIs when absent", () => {
    expect([...REQUIRED_OPERATIONAL_TABLES]).toEqual([
      "InspectionChecklistTemplate",
      "InspectionRound",
      "OperationalDocument",
      "MaintenancePlan",
      "ComponentLifecycleEvent",
      "ComponentCostEntry",
      "WorkOrderNumberCounter",
      "WorkOrderStatusEvent",
      "WorkOrderEditLock",
      "WorkOrderComment",
      "WorkOrderTimeEntry",
      "WorkOrderMaterialEntry",
      "WorkOrderInvoiceDraft",
    ]);
  });

  it("probes WorkOrder enterprise columns written unconditionally on create", () => {
    expect([...REQUIRED_OPERATIONAL_COLUMNS]).toEqual([
      { table: "WorkOrder", column: "work_order_number" },
      { table: "WorkOrder", column: "work_type" },
      { table: "WorkOrder", column: "source" },
      { table: "WorkOrder", column: "sla_response_due_at" },
      { table: "WorkOrder", column: "sla_resolution_due_at" },
      { table: "WorkOrder", column: "sla_status" },
    ]);
    const probedColumns = REQUIRED_OPERATIONAL_COLUMNS.map((item) => String(item.column));
    expect(probedColumns).not.toContain("vendor_contract_id");
    expect(probedColumns).not.toContain("ai_source");
  });

  it("treats missing WorkOrder enterprise columns as blocking Översikt", () => {
    expect(
      canRenderHomeDashboard({
        missing: [{ table: "WorkOrder", column: "work_order_number" }],
      }),
    ).toBe(false);
  });

  it("formats missing columns as table.column and missing tables by name", () => {
    expect(formatSchemaMissingItem({ table: "Ticket", column: "deleted_at" })).toBe("Ticket.deleted_at");
    expect(formatSchemaMissingItem({ table: "InspectionChecklistTemplate", column: "*" })).toBe(
      "InspectionChecklistTemplate",
    );
    expect(
      formatSchemaMissing([
        { table: "Ticket", column: "deleted_at" },
        { table: "InspectionChecklistTemplate", column: "*" },
        "AuditLog.module",
      ]),
    ).toBe("Ticket.deleted_at, InspectionChecklistTemplate, AuditLog.module");
  });

  it("keeps Översikt available when only module tables are missing", () => {
    expect(
      canRenderHomeDashboard({
        missing: [{ table: "InspectionChecklistTemplate", column: "*" }],
      }),
    ).toBe(true);
    expect(
      canRenderHomeDashboard({
        missing: [
          { table: "InspectionRound", column: "*" },
          { table: "MaintenancePlan", column: "*" },
        ],
      }),
    ).toBe(true);
    expect(
      canRenderHomeDashboard({
        missing: [{ table: "Ticket", column: "deleted_at" }],
      }),
    ).toBe(false);
    expect(canRenderHomeDashboard({ missing: [] })).toBe(true);
  });

  it("omits Ticket.ai_source writes and selects until Database Release", () => {
    expect(ticketAiSourceWrite(false, "fallback")).toEqual({});
    expect(ticketAiSourceWrite(true, "provider")).toEqual({ ai_source: "provider" });
    expect(ticketAiSourceSelect(false)).toEqual({});
    expect(ticketAiSourceSelect(true)).toEqual({ ai_source: true });
  });

  it("omits WorkOrder.vendor_contract_id writes and relations until Database Release", () => {
    expect(workOrderVendorWrite(false, "vendor-1")).toEqual({});
    expect(workOrderVendorWrite(true, "vendor-1")).toEqual({ vendor_contract_id: "vendor-1" });
    expect(workOrderVendorWrite(true, null)).toEqual({ vendor_contract_id: null });
    expect(workOrderVendorIdSelect(false)).toEqual({});
    expect(workOrderVendorIdSelect(true)).toEqual({ vendor_contract_id: true });
    expect(workOrderVendorRelationSelect(false)).toEqual({});
    expect(workOrderVendorRelationSelect(true)).toEqual({
      vendor_contract: { select: { id: true, name: true, category: true, status: true } },
    });
  });
});
