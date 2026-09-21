import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, canViewFinanceData, getCurrentUser, requireCompanyUser, type CompanyUser } from "@/lib/current-user";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { isAssignedWorkAccessible, notFoundWorkOrder } from "@/lib/assigned-work-access";
import { completeWorkOrderLifecycle, WorkOrderCompletionConflict } from "@/lib/work-order-completion";
import { canFinalizeWorkOrderExecution, isWorkOrderExecutionLocked } from "@/lib/work-order-execution-policy";
import { normalizeInspectionTemplateItems } from "@/lib/inspection-checklist-template";
import { isMissingTableError, schemaMismatchUserMessage, hasWorkOrderVendorContractColumn } from "@/lib/schema-readiness";
import { notifyVendor } from "@/lib/vendor-notify";
import { notifyTicketReporter } from "@/lib/ticket-reporter-notify";
import { notifyAssignee } from "@/lib/assignee-notify";
import {
  getModernMaterialEntry,
  getModernTimeEntry,
  upsertMaterialEntry,
  upsertTimeEntry,
} from "@/lib/work-order-ops-storage";

const entryTypes = new Set(["time", "material", "travel", "external"]);

type ChecklistRow = {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  completed_at: Date | null;
  completed_by_id: string | null;
  created_at: Date;
};

type ExecutionRow = {
  id: string;
  entry_type: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  total_amount: number;
  minutes: number | null;
  distance_km: number | null;
  supplier: string | null;
  occurred_at: Date;
  created_at: Date;
};

type SummaryRow = {
  total_minutes: number;
  material_cost: number;
  travel_cost: number;
  external_cost: number;
  total_cost: number;
};

type SlaRow = {
  response_due_at: Date | null;
  completion_due_at: Date | null;
  responded_at: Date | null;
  sla_status: string;
};

type CompletionRow = {
  required_incomplete: number;
  before_photos: number;
  after_photos: number;
};

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function resolveWorkOrder(user: CompanyUser, id: string) {
  const workOrder = await db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: user.company_id, property: { deleted_at: null } },
    select: { id: true, title: true, status: true, assigned_to_id: true, assigned_to: { select: { email: true } } },
  });
  if (!workOrder) return null;
  if (!isAssignedWorkAccessible(user, workOrder.assigned_to_id)) return null;
  return workOrder;
}

async function getCompletionState(
  client: typeof db | Prisma.TransactionClient,
  id: string,
  companyId: string,
) {
  const documentGuard = await sqlSoftDeleteGuard(db, "OperationalDocument", "d");
  const rows = await client.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      (SELECT COUNT(*)::integer
       FROM "WorkOrderChecklistItem"
       WHERE "company_id" = ${companyId}
         AND "work_order_id" = ${id}
         AND "is_required" = true
         AND "completed_at" IS NULL) AS "required_incomplete",
      (SELECT COUNT(*)::integer
       FROM "OperationalDocument" d
       WHERE d."company_id" = ${companyId}
         AND d."work_order_id" = ${id}
         ${documentGuard}
         AND d."category" IN ('before_photo', 'before')) AS "before_photos",
      (SELECT COUNT(*)::integer
       FROM "OperationalDocument" d
       WHERE d."company_id" = ${companyId}
         AND d."work_order_id" = ${id}
         ${documentGuard}
         AND d."category" IN ('after_photo', 'after')) AS "after_photos"
  `);
  return rows[0] ?? { required_incomplete: 0, before_photos: 0, after_photos: 0 };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(user, id);
  if (!workOrder) return notFoundWorkOrder();

  const [checklist, entries, summaries, slaRows, completion] = await Promise.all([
    db.$queryRaw<ChecklistRow[]>(Prisma.sql`
      SELECT "id", "title", "description", "is_required", "sort_order", "completed_at", "completed_by_id", "created_at"
      FROM "WorkOrderChecklistItem"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "sort_order" ASC, "created_at" ASC
    `),
    db.$queryRaw<ExecutionRow[]>(Prisma.sql`
      SELECT "id", "entry_type", "description",
             "quantity"::double precision AS "quantity", "unit",
             "unit_cost"::double precision AS "unit_cost",
             "total_amount"::double precision AS "total_amount",
             "minutes", "distance_km"::double precision AS "distance_km",
             "supplier", "occurred_at", "created_at"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "occurred_at" DESC, "created_at" DESC
      LIMIT 250
    `),
    db.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM("minutes"), 0)::integer AS "total_minutes",
        COALESCE(SUM(CASE WHEN "entry_type" = 'material' THEN "total_amount" ELSE 0 END), 0)::double precision AS "material_cost",
        COALESCE(SUM(CASE WHEN "entry_type" = 'travel' THEN "total_amount" ELSE 0 END), 0)::double precision AS "travel_cost",
        COALESCE(SUM(CASE WHEN "entry_type" = 'external' THEN "total_amount" ELSE 0 END), 0)::double precision AS "external_cost",
        COALESCE(SUM("total_amount"), 0)::double precision AS "total_cost"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
    `),
    (async () => {
      const workOrderGuard = await sqlSoftDeleteGuard(db, "WorkOrder", "w");
      return db.$queryRaw<SlaRow[]>(Prisma.sql`
        SELECT w."response_due_at", w."completion_due_at", w."responded_at", w."sla_status"
        FROM "WorkOrder" w
        WHERE w."id" = ${id} AND w."company_id" = ${user.company_id}
          ${workOrderGuard}
        LIMIT 1
      `);
    })(),
    getCompletionState(db, id, user.company_id),
  ]);

  const includeFinance = canViewFinanceData(user.role);
  const { assigned_to_id: _aid, assigned_to: _assignedTo, ...workOrderData } = workOrder;
  void _aid;
  void _assignedTo;
  const visibleEntries = includeFinance
    ? entries
    : entries.map((e) => ({ ...e, unit_cost: null, total_amount: null }));
  const rawSummary = summaries[0] ?? { total_minutes: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 };
  const visibleSummary = includeFinance
    ? rawSummary
    : { total_minutes: rawSummary.total_minutes, material_cost: null, travel_cost: null, external_cost: null, total_cost: null };

  return NextResponse.json({
    workOrder: workOrderData,
    checklist,
    entries: visibleEntries,
    summary: visibleSummary,
    sla: slaRows[0] ?? { response_due_at: null, completion_due_at: null, responded_at: null, sla_status: "not_set" },
    completion: {
      status: workOrder.status,
      required_incomplete: completion.required_incomplete,
      before_photo_count: completion.before_photos,
      after_photo_count: completion.after_photos,
    },
    canManage: canManageTickets(user.role),
    canViewFinance: includeFinance,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(user as CompanyUser, id);
  if (!workOrder) return notFoundWorkOrder();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }
  const action = String(body.action || "");

  if (["checklist.create", "checklist.complete", "checklist.applyTemplate", "entry.create"].includes(action) && isWorkOrderExecutionLocked(workOrder.status)) {
    return NextResponse.json({ error: "Arbetsorderns utförande är låst i nuvarande status" }, { status: 409 });
  }

  if (action === "checklist.create") {
    const title = String(body.title || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const sortOrder = Math.max(0, Math.floor(Number(body.sortOrder || 0)));
    if (!title) return NextResponse.json({ error: "Kontrollpunkten behöver en rubrik" }, { status: 400 });
    if (title.length > 240) return NextResponse.json({ error: "Rubriken är för lång" }, { status: 400 });

    const itemId = crypto.randomUUID();
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderChecklistItem"
          ("id", "company_id", "work_order_id", "created_by_id", "title", "description", "is_required", "sort_order")
        VALUES
          (${itemId}, ${user.company_id}, ${id}, ${user.id}, ${title}, ${description}, ${body.isRequired !== false}, ${sortOrder})
      `);

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.checklist_created",
        metadata: { itemId, title, isRequired: body.isRequired !== false },
      }, tx);
    });
    return NextResponse.json({ id: itemId }, { status: 201 });
  }

  if (action === "checklist.applyTemplate") {
    const templateId = String(body.templateId || "").trim();
    if (!templateId) return NextResponse.json({ error: "Checklistmallen saknas" }, { status: 400 });
    const companyId = user.company_id;

    let template: { id: string; name: string; items: Prisma.JsonValue } | undefined;
    try {
      const templates = await db.$queryRaw<Array<{ id: string; name: string; items: Prisma.JsonValue }>>(Prisma.sql`
        SELECT "id", "name", "items"
        FROM "InspectionChecklistTemplate"
        WHERE "id" = ${templateId} AND "company_id" = ${companyId}
        LIMIT 1
      `);
      template = templates[0];
    } catch (error) {
      if (isMissingTableError(error, "InspectionChecklistTemplate")) {
        return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
      }
      throw error;
    }
    if (!template) return NextResponse.json({ error: "Checklistmallen hittades inte" }, { status: 404 });
    const selectedTemplate = template;

    const labels = normalizeInspectionTemplateItems(selectedTemplate.items);
    if (labels.length === 0) {
      return NextResponse.json({ error: "Mallen saknar kontrollpunkter" }, { status: 409 });
    }

    const applied = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`work-order-checklist:${id}`})) AS locked
      `);
      if (!lock[0]?.locked) return { conflict: "locked" as const, added: 0 };

      const existingRows = await tx.$queryRaw<Array<{ title: string }>>(Prisma.sql`
        SELECT "title"
        FROM "WorkOrderChecklistItem"
        WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      `);
      const existingTitles = new Set(existingRows.map((row) => row.title.trim().toLowerCase()));
      const maxRows = await tx.$queryRaw<Array<{ max_sort: number }>>(Prisma.sql`
        SELECT COALESCE(MAX("sort_order"), -1)::integer AS "max_sort"
        FROM "WorkOrderChecklistItem"
        WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      `);
      let sortOrder = (maxRows[0]?.max_sort ?? -1) + 1;
      const toAdd = labels.filter((label) => !existingTitles.has(label.toLowerCase()));
      if (toAdd.length === 0) return { conflict: "duplicate" as const, added: 0 };

      for (const title of toAdd) {
        const itemId = crypto.randomUUID();
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WorkOrderChecklistItem"
            ("id", "company_id", "work_order_id", "created_by_id", "title", "description", "is_required", "sort_order")
          VALUES
            (${itemId}, ${companyId}, ${id}, ${user.id}, ${title}, ${null}, true, ${sortOrder})
        `);
        sortOrder += 1;
      }

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.checklist_template_applied",
        metadata: {
          templateId: selectedTemplate.id,
          addedCount: toAdd.length,
          skippedCount: labels.length - toAdd.length,
        },
      }, tx);

      return { conflict: null, added: toAdd.length };
    });

    if (applied.conflict === "locked") {
      return NextResponse.json({ error: "Checklistan uppdateras redan, försök igen om en stund" }, { status: 409 });
    }
    if (applied.conflict === "duplicate") {
      return NextResponse.json({ error: "Alla punkter från mallen finns redan på arbetsordern" }, { status: 409 });
    }
    return NextResponse.json({ success: true, addedCount: applied.added }, { status: 201 });
  }

  if (action === "checklist.complete") {
    const itemId = String(body.itemId || "");
    const completed = body.completed !== false;
    if (!itemId) return NextResponse.json({ error: "Kontrollpunkt saknas" }, { status: 400 });

    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderChecklistItem"
        SET "completed_at" = ${completed ? new Date() : null},
            "completed_by_id" = ${completed ? user.id : null},
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${itemId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      `);
      if (!updated) return 0;

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: completed ? "work_order.checklist_completed" : "work_order.checklist_reopened",
        metadata: { itemId },
      }, tx);
      return updated;
    });
    if (!changed) return NextResponse.json({ error: "Kontrollpunkten hittades inte" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  if (action === "entry.create") {
    const entryType = String(body.entryType || "");
    const description = String(body.description || "").trim();
    if (!entryTypes.has(entryType)) return NextResponse.json({ error: "Ogiltig registreringstyp" }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Beskrivning krävs" }, { status: 400 });

    const quantity = nonNegativeNumber(body.quantity, 1);
    const unitCost = nonNegativeNumber(body.unitCost, 0);
    const explicitAmount = body.totalAmount === undefined ? null : nonNegativeNumber(body.totalAmount);
    const minutes = body.minutes === undefined || body.minutes === "" ? null : nonNegativeNumber(body.minutes);
    const distanceKm = body.distanceKm === undefined || body.distanceKm === "" ? null : nonNegativeNumber(body.distanceKm);
    if ([quantity, unitCost, explicitAmount, minutes, distanceKm].some((value) => value === undefined)) {
      return NextResponse.json({ error: "Belopp, tid och mängd måste vara noll eller större" }, { status: 400 });
    }

    const totalAmount = explicitAmount ?? Number(quantity) * Number(unitCost);
    const occurredAt = optionalDate(body.occurredAt);
    if (occurredAt === undefined) return NextResponse.json({ error: "Ogiltigt datum" }, { status: 400 });

    const entryId = crypto.randomUUID();
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderExecutionEntry"
          ("id", "company_id", "work_order_id", "created_by_id", "entry_type", "description", "quantity", "unit", "unit_cost", "total_amount", "minutes", "distance_km", "supplier", "occurred_at")
        VALUES
          (${entryId}, ${user.company_id}, ${id}, ${user.id}, ${entryType}, ${description}, ${quantity}, ${body.unit ? String(body.unit).trim() : null}, ${unitCost}, ${totalAmount}, ${minutes === null ? null : Math.floor(Number(minutes))}, ${distanceKm}, ${body.supplier ? String(body.supplier).trim() : null}, ${occurredAt ?? new Date()})
      `);

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: `work_order.${entryType}_registered`,
        metadata: { entryId, description, totalAmount, minutes, distanceKm },
      }, tx);
    });
    return NextResponse.json({ id: entryId }, { status: 201 });
  }

  if (action === "sla.update") {
    return NextResponse.json({
      error: "SLA ändras via arbetsorderns styrda SLA-funktion",
      code: "canonical_sla_route_required",
    }, { status: 409 });
  }

  if (action === "completion.finalize") {
    if (!canFinalizeWorkOrderExecution(workOrder.status)) {
      return NextResponse.json({ error: "Arbetsordern kan bara slutföras när den är påbörjad" }, { status: 409 });
    }

    const completion = await getCompletionState(db, id, user.company_id);
    if (completion.required_incomplete > 0) {
      return NextResponse.json({ error: `${completion.required_incomplete} obligatoriska kontrollpunkter återstår` }, { status: 400 });
    }
    if (completion.after_photos < 1) {
      return NextResponse.json({ error: "Ladda upp minst en efterbild innan arbetsordern slutförs" }, { status: 400 });
    }

    const companyId = user.company_id;
    const completedAt = new Date();
    let result: {
      actualCost: number;
      finalSlaStatus: string;
      promotedTime: number;
      promotedMaterial: number;
      ticketSync: { changed?: boolean } | null;
      ticketId: string | null;
    };
    try {
      result = await db.$transaction(async (tx) => {
        const totals = await tx.$queryRaw<{ total_cost: number }[]>(Prisma.sql`
          SELECT COALESCE(SUM("total_amount"), 0)::double precision AS "total_cost"
          FROM "WorkOrderExecutionEntry"
          WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
        `);
        const actualCost = totals[0]?.total_cost ?? 0;
        const workOrderGuard = await sqlSoftDeleteGuard(db, "WorkOrder", "w");
        const slaRows = await tx.$queryRaw<{ completion_due_at: Date | null }[]>(Prisma.sql`
          SELECT w."completion_due_at"
          FROM "WorkOrder" w
          WHERE w."id" = ${id} AND w."company_id" = ${companyId}
            ${workOrderGuard}
          LIMIT 1
        `);
        const completionDueAt = slaRows[0]?.completion_due_at ?? null;
        const finalSlaStatus = completionDueAt && completedAt > completionDueAt ? "breached" : completionDueAt ? "met" : "not_set";

        const executionEntries = await tx.$queryRaw<Array<{
          id: string;
          entry_type: string;
          description: string;
          quantity: number;
          unit: string | null;
          unit_cost: number | null;
          total_amount: number;
          minutes: number | null;
          supplier: string | null;
          occurred_at: Date;
        }>>(Prisma.sql`
          SELECT "id", "entry_type", "description",
                 "quantity"::double precision AS "quantity",
                 "unit",
                 "unit_cost"::double precision AS "unit_cost",
                 "total_amount"::double precision AS "total_amount",
                 "minutes",
                 "supplier",
                 "occurred_at"
          FROM "WorkOrderExecutionEntry"
          WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
          ORDER BY "occurred_at" ASC, "created_at" ASC
        `);

        let promotedTime = 0;
        let promotedMaterial = 0;
        for (const entry of executionEntries) {
          if (entry.entry_type === "time" || entry.entry_type === "travel") {
            const existing = await getModernTimeEntry(companyId, id, entry.id, tx);
            if (existing) continue;
            const minutes = Math.max(1, Math.floor(Number(entry.minutes || 0)) || Math.max(1, Math.round((Number(entry.quantity) || 0) * 60)));
            const endedAt = entry.occurred_at.toISOString();
            const startedAt = new Date(entry.occurred_at.getTime() - minutes * 60_000).toISOString();
            await upsertTimeEntry(companyId, {
              entryId: entry.id,
              workOrderId: id,
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              kind: entry.entry_type === "travel" ? "travel" : "work",
              action: "manual",
              startedAt,
              endedAt,
              minutes,
              billable: true,
              note: entry.description.slice(0, 1000),
              status: "submitted",
              actorId: user.id,
            }, tx);
            promotedTime += 1;
          } else if (entry.entry_type === "material" || entry.entry_type === "external") {
            const existing = await getModernMaterialEntry(companyId, id, entry.id, tx);
            if (existing) continue;
            const quantity = Math.max(0.01, Number(entry.quantity) || 1);
            const unitPrice = Number(entry.unit_cost ?? 0);
            const total = Number(entry.total_amount ?? quantity * unitPrice);
            await upsertMaterialEntry(companyId, {
              entryId: entry.id,
              workOrderId: id,
              name: entry.description.slice(0, 200) || (entry.entry_type === "external" ? "Extern kostnad" : "Material"),
              quantity,
              unit: (entry.unit || "st").slice(0, 30),
              unitPrice,
              total: Math.round(total * 100) / 100,
              supplier: entry.supplier,
              stockStatus: "used",
              billable: true,
              note: entry.entry_type === "external" ? "Promoted från fältregistrering (extern)" : "Promoted från fältregistrering",
              status: "submitted",
              createdById: user.id,
              createdByName: user.name,
              createdByEmail: user.email,
              actorId: user.id,
            }, tx);
            promotedMaterial += 1;
          }
        }

        const lifecycle = await completeWorkOrderLifecycle(tx, {
          companyId,
          workOrderId: id,
          actorUserId: user.id,
          completedAt,
          actualCost,
          legacySlaStatus: finalSlaStatus,
          statusEventMetadata: {
            source: "execution.finalize",
            promotedTime,
            promotedMaterial,
          },
        });

        await writeAuditLog(user, {
          entityType: "work_order",
          entityId: id,
          action: "work_order.completed",
          metadata: {
            actualCost,
            slaStatus: finalSlaStatus,
            beforePhotos: completion.before_photos,
            afterPhotos: completion.after_photos,
            promotedTime,
            promotedMaterial,
            storage: "WorkOrderExecutionEntry+WorkOrderTimeEntry+WorkOrderMaterialEntry",
          },
        }, tx);

        return {
          actualCost,
          finalSlaStatus,
          promotedTime,
          promotedMaterial,
          ticketSync: lifecycle.ticketSync,
          ticketId: lifecycle.workOrder.ticket_id,
        };
      });
    } catch (error) {
      if (error instanceof WorkOrderCompletionConflict) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }

    try {
      if (await hasWorkOrderVendorContractColumn()) {
        const assigned = await db.workOrder.findFirst({
          where: { id, company_id: user.company_id, deleted_at: null },
          select: {
            title: true,
            work_order_number: true,
            vendor_contract_id: true,
            property: { select: { name: true } },
          },
        });
        const vendorContractId = assigned?.vendor_contract_id?.trim() || "";
        if (vendorContractId) {
          const vendor = await db.vendorContract.findFirst({
            where: { id: vendorContractId, company_id: user.company_id },
            select: { email: true },
          });
          await notifyVendor(user, {
            workOrderId: id,
            title: assigned?.title || workOrder.title,
            workOrderNumber: assigned?.work_order_number,
            propertyName: assigned?.property?.name,
            vendorContractId,
            vendorEmail: vendor?.email,
            kind: "completed",
          });
        }
      }
    } catch {
      // Completion is already persisted; vendor mail must not fail the finalize response.
    }

    try {
      await notifyAssignee(user, {
        id,
        title: workOrder.title,
        kind: "work_order",
        assigneeId: workOrder.assigned_to_id,
        assigneeEmail: workOrder.assigned_to?.email,
        notifyKind: "completed",
      });
    } catch {
      // Completion is already persisted; assignee mail must not fail the finalize response.
    }

    if (result.ticketSync?.changed && result.ticketId) {
      try {
        const linkedTicket = await db.ticket.findFirst({
          where: { id: result.ticketId, company_id: user.company_id, deleted_at: null },
          select: {
            id: true,
            title: true,
            status: true,
            public_reference: true,
            reporter_email: true,
            reporter_phone: true,
          },
        });
        if (linkedTicket) {
          await notifyTicketReporter(user, linkedTicket, "updated");
        }
      } catch {
        // Completion is already persisted; reporter mail must not fail the finalize response.
      }
    }

    return NextResponse.json({
      success: true,
      actualCost: result.actualCost,
      slaStatus: result.finalSlaStatus,
      promoted: { time: result.promotedTime, material: result.promotedMaterial },
    });
  }

  return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
}
