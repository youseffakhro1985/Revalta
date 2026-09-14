import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { findAccessibleWorkOrder, notFoundWorkOrder } from "@/lib/assigned-work-access";
import { canManageWorkOrderFinance, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import {
  listMaterialEntries,
  listTimeEntries,
  upsertMaterialEntry,
  upsertTimeEntry,
  type MaterialEntryPayload,
  type TimeEntryPayload,
} from "@/lib/work-order-ops-storage";

const allowedActions = new Set(["approveSubmitted", "rejectSubmitted"]);

function isModern(source?: TimeEntryPayload["source"] | MaterialEntryPayload["source"]) {
  return source !== "legacy";
}

function attestTime(row: TimeEntryPayload, action: "approve" | "reject", actorId: string): TimeEntryPayload {
  return {
    entryId: row.entryId,
    workOrderId: row.workOrderId,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    kind: row.kind,
    action,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    minutes: row.minutes,
    billable: row.billable,
    note: row.note,
    status: action === "approve" ? "approved" : "rejected",
    actorId,
    createdAt: row.createdAt,
  };
}

function attestMaterial(row: MaterialEntryPayload, status: "approved" | "rejected", actorId: string): MaterialEntryPayload {
  return {
    entryId: row.entryId,
    workOrderId: row.workOrderId,
    articleNumber: row.articleNumber,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    total: row.total,
    supplier: row.supplier,
    stockStatus: row.stockStatus,
    billable: row.billable,
    note: row.note,
    status,
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdByEmail: row.createdByEmail,
    actorId,
    createdAt: row.createdAt,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att attestera tid och material" }, { status: 403 });
  }

  const companyId = user.company_id;
  const { id } = await params;
  if (!await findAccessibleWorkOrder(user as CompanyUser, id, { id: true, assigned_to_id: true, title: true })) {
    return notFoundWorkOrder();
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  const action = String(body.action || "");
  if (!allowedActions.has(action)) {
    return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  }

  const nextStatus = action === "approveSubmitted" ? "approved" : "rejected";
  const timeAction = action === "approveSubmitted" ? "approve" : "reject";

  const [times, materials] = await Promise.all([
    listTimeEntries(companyId, id),
    listMaterialEntries(companyId, id),
  ]);

  const pendingTime = times.filter((row) => row.status === "submitted" && isModern(row.source));
  const pendingMaterial = materials.filter((row) => row.status === "submitted" && isModern(row.source));
  const legacyPending =
    times.some((row) => row.status === "submitted" && row.source === "legacy")
    || materials.some((row) => row.status === "submitted" && row.source === "legacy");

  if (pendingTime.length === 0 && pendingMaterial.length === 0) {
    if (legacyPending) {
      return NextResponse.json({
        error: "Inskickade rader finns kvar i äldre lagring. Kör backfill innan de kan attesteras.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Det finns inga inskickade tid- eller materialrader att attestera" }, { status: 409 });
  }

  const result = await db.$transaction(async (tx) => {
    const updatedTime = [];
    const updatedMaterial = [];
    for (const row of pendingTime) {
      updatedTime.push(await upsertTimeEntry(companyId, attestTime(row, timeAction, user.id), tx));
    }
    for (const row of pendingMaterial) {
      updatedMaterial.push(await upsertMaterialEntry(companyId, attestMaterial(row, nextStatus, user.id), tx));
    }
    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: action === "approveSubmitted"
        ? "work_order.attestation_approve_submitted"
        : "work_order.attestation_reject_submitted",
      metadata: {
        timeCount: pendingTime.length,
        materialCount: pendingMaterial.length,
        timeEntryIds: pendingTime.map((row) => row.entryId),
        materialEntryIds: pendingMaterial.map((row) => row.entryId),
        status: nextStatus,
        storage: "WorkOrderTimeEntry+WorkOrderMaterialEntry",
      },
    }, tx);
    return { updatedTime, updatedMaterial };
  });

  return NextResponse.json({
    action,
    status: nextStatus,
    time: { count: result.updatedTime.length, ids: pendingTime.map((row) => row.entryId) },
    material: { count: result.updatedMaterial.length, ids: pendingMaterial.map((row) => row.entryId) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
