import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  getMaterialEntry,
  listMaterialEntries,
  upsertMaterialEntry,
  type MaterialEntryPayload,
} from "@/lib/work-order-ops-storage";

const units = new Set(["st", "m", "m2", "m3", "kg", "l", "förp"]);
const stocks = new Set(["in_stock", "ordered", "used", "returned"]);

async function ensureOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({ where: { deleted_at: null, id, company_id: companyId }, select: { id: true, title: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  if (!(await ensureOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const rows = (await listMaterialEntries(user.company_id, id))
    .filter((row) => row.status !== "deleted")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const summary = rows.reduce((acc, row) => {
    acc.total += row.total;
    if (row.billable) acc.billable += row.total;
    if (row.status === "submitted") acc.pending += 1;
    if (row.stockStatus === "ordered") acc.ordered += 1;
    return acc;
  }, { total: 0, billable: 0, pending: 0, ordered: 0 });

  return NextResponse.json({
    materials: rows,
    summary,
    canManage: canManageTickets(user.role),
    currentUserId: user.id,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  if (!(await ensureOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "create");
  if (!["create", "approve", "reject", "delete"].includes(action)) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  const entryId = String(body.entryId || crypto.randomUUID());
  let row: MaterialEntryPayload;

  if (action === "create") {
    const name = String(body.name || "").trim().slice(0, 200);
    const quantity = Number(body.quantity);
    const unitPrice = Number(body.unitPrice);
    const unit = String(body.unit || "st");
    const stockStatus = String(body.stockStatus || "used");
    if (!name) return NextResponse.json({ error: "Materialnamn krävs" }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return NextResponse.json({ error: "Antalet är ogiltigt" }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000000) return NextResponse.json({ error: "Styckpriset är ogiltigt" }, { status: 400 });
    if (!units.has(unit) || !stocks.has(stockStatus)) return NextResponse.json({ error: "Ogiltig enhet eller lagerstatus" }, { status: 400 });
    const total = Math.round(quantity * unitPrice * 100) / 100;
    row = {
      entryId,
      workOrderId: id,
      articleNumber: body.articleNumber ? String(body.articleNumber).trim().slice(0, 100) : null,
      name,
      quantity,
      unit,
      unitPrice,
      total,
      supplier: body.supplier ? String(body.supplier).trim().slice(0, 200) : null,
      stockStatus: stockStatus as MaterialEntryPayload["stockStatus"],
      billable: body.billable !== false,
      note: body.note ? String(body.note).trim().slice(0, 1000) : null,
      status: "submitted",
      createdById: user.id,
      createdByName: user.name,
      createdByEmail: user.email,
      actorId: user.id,
    };
  } else {
    if (!canManageTickets(user.role) && action !== "delete") return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    const existing = await getMaterialEntry(user.company_id, id, entryId);
    if (!existing) return NextResponse.json({ error: "Materialraden hittades inte" }, { status: 404 });
    if (action === "delete" && existing.createdById !== user.id && !canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du kan bara ta bort dina egna rader" }, { status: 403 });
    }
    row = {
      ...existing,
      status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "deleted",
      actorId: user.id,
    };
  }

  const material = await upsertMaterialEntry(user.company_id, row);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: `work_order.material_${action}`,
    metadata: { entryId, name: row.name, quantity: row.quantity, total: row.total, status: row.status, storage: "WorkOrderMaterialEntry" },
  });
  return NextResponse.json({ material }, { status: 201 });
}
