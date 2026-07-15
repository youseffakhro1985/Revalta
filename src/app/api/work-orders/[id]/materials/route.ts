import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, canViewOperations, getCurrentUser } from "@/lib/current-user";

function positiveNumber(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} måste vara större än noll`);
  return parsed;
}
function nonNegativeNumber(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} får inte vara negativt`);
  return parsed;
}

async function resolveWorkOrder(id: string, companyId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    SELECT "id", "status" FROM "WorkOrder" WHERE "id" = ${id} AND "company_id" = ${companyId} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  if (!await resolveWorkOrder(id, user.company_id)) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [catalog, entries, approvalSummary] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT i."id", i."article_number", i."name", i."description", i."unit",
             i."default_unit_cost"::double precision AS "default_unit_cost", i."supplier", i."supplier_article_number",
             COALESCE(SUM(s."quantity"), 0)::double precision AS "stock_quantity",
             COALESCE(SUM(s."reserved_quantity"), 0)::double precision AS "reserved_quantity"
      FROM "InventoryItem" i
      LEFT JOIN "InventoryStock" s ON s."inventory_item_id" = i."id" AND s."company_id" = i."company_id"
      WHERE i."company_id" = ${user.company_id} AND i."active" = true
      GROUP BY i."id" ORDER BY i."name" ASC LIMIT 500
    `),
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e."id", e."description", e."quantity"::double precision AS "quantity", e."unit",
             e."unit_cost"::double precision AS "unit_cost", e."total_amount"::double precision AS "total_amount",
             e."supplier", e."occurred_at", e."approval_status", e."approved_at", e."approval_comment",
             e."voided_at", e."void_reason", i."article_number", i."name" AS "item_name",
             CASE WHEN a."id" IS NULL THEN NULL ELSE json_build_object('name', a."name", 'email', a."email") END AS "approved_by"
      FROM "WorkOrderExecutionEntry" e
      LEFT JOIN "InventoryItem" i ON i."id" = e."inventory_item_id"
      LEFT JOIN "User" a ON a."id" = e."approved_by_id"
      WHERE e."company_id" = ${user.company_id} AND e."work_order_id" = ${id} AND e."entry_type" = 'material'
      ORDER BY e."occurred_at" DESC, e."created_at" DESC LIMIT 250
    `),
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'pending' THEN "total_amount" ELSE 0 END), 0)::double precision AS "pending",
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'approved' THEN "total_amount" ELSE 0 END), 0)::double precision AS "approved",
        COALESCE(SUM(CASE WHEN "voided_at" IS NULL AND "approval_status" = 'rejected' THEN "total_amount" ELSE 0 END), 0)::double precision AS "rejected"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND "entry_type" = 'material'
    `),
  ]);
  return NextResponse.json({ catalog, entries, approvalSummary: approvalSummary[0] ?? { pending: 0, approved: 0, rejected: 0 }, canApprove: canViewOperations(user.role) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "item.create") {
      const articleNumber = String(body.articleNumber || "").trim();
      const name = String(body.name || "").trim();
      const unit = String(body.unit || "st").trim();
      const defaultUnitCost = nonNegativeNumber(body.defaultUnitCost ?? 0, "Standardpris");
      if (!articleNumber || !name || !unit) return NextResponse.json({ error: "Artikelnummer, namn och enhet krävs" }, { status: 400 });
      const itemId = randomUUID();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "InventoryItem" ("id", "company_id", "article_number", "name", "description", "unit", "default_unit_cost", "supplier", "supplier_article_number")
        VALUES (${itemId}, ${user.company_id}, ${articleNumber}, ${name}, ${body.description ? String(body.description).trim() : null}, ${unit}, ${defaultUnitCost}, ${body.supplier ? String(body.supplier).trim() : null}, ${body.supplierArticleNumber ? String(body.supplierArticleNumber).trim() : null})
      `);
      await writeAuditLog(user, { entityType: "inventory_item", entityId: itemId, action: "inventory.item_created", metadata: { articleNumber, name, unit, defaultUnitCost } });
      return NextResponse.json({ id: itemId }, { status: 201 });
    }

    if (action === "stock.receive") {
      const itemId = String(body.itemId || "");
      const quantity = positiveNumber(body.quantity, "Antal");
      const unitCost = nonNegativeNumber(body.unitCost ?? 0, "Inköpspris");
      const location = String(body.location || "Huvudlager").trim();
      const item = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} AND "company_id" = ${user.company_id} AND "active" = true LIMIT 1`);
      if (!item[0]) return NextResponse.json({ error: "Artikeln hittades inte" }, { status: 404 });
      const transactionId = randomUUID();
      await db.$transaction(async (tx) => {
        const stocks = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryStock" WHERE "inventory_item_id" = ${itemId} AND "location" = ${location} FOR UPDATE`);
        const stockId = stocks[0]?.id ?? randomUUID();
        if (stocks[0]) await tx.$executeRaw(Prisma.sql`UPDATE "InventoryStock" SET "quantity" = "quantity" + ${quantity}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${stockId}`);
        else await tx.$executeRaw(Prisma.sql`INSERT INTO "InventoryStock" ("id", "company_id", "inventory_item_id", "location", "quantity") VALUES (${stockId}, ${user.company_id}, ${itemId}, ${location}, ${quantity})`);
        await tx.$executeRaw(Prisma.sql`INSERT INTO "InventoryTransaction" ("id", "company_id", "inventory_item_id", "inventory_stock_id", "actor_user_id", "transaction_type", "quantity", "unit_cost", "reason") VALUES (${transactionId}, ${user.company_id}, ${itemId}, ${stockId}, ${user.id}, 'receipt', ${quantity}, ${unitCost}, ${body.reason ? String(body.reason).trim() : 'Inleverans'})`);
      });
      await writeAuditLog(user, { entityType: "inventory_item", entityId: itemId, action: "inventory.stock_received", metadata: { quantity, unitCost, location, transactionId } });
      return NextResponse.json({ success: true });
    }

    if (action === "material.issue") {
      if (["completed", "invoiced", "closed", "cancelled"].includes(workOrder.status)) return NextResponse.json({ error: "Material kan inte registreras på en avslutad arbetsorder" }, { status: 409 });
      const itemId = String(body.itemId || "");
      const quantity = positiveNumber(body.quantity, "Antal");
      const location = String(body.location || "Huvudlager").trim();
      const description = String(body.description || "Materialuttag").trim();
      const rows = await db.$queryRaw<Array<{ id: string; name: string; unit: string; default_unit_cost: number }>>(Prisma.sql`SELECT "id", "name", "unit", "default_unit_cost"::double precision AS "default_unit_cost" FROM "InventoryItem" WHERE "id" = ${itemId} AND "company_id" = ${user.company_id} AND "active" = true LIMIT 1`);
      const item = rows[0];
      if (!item) return NextResponse.json({ error: "Artikeln hittades inte" }, { status: 404 });
      const unitCost = body.unitCost === undefined || body.unitCost === "" ? item.default_unit_cost : nonNegativeNumber(body.unitCost, "Enhetspris");
      const entryId = randomUUID(); const transactionId = randomUUID();
      await db.$transaction(async (tx) => {
        const stocks = await tx.$queryRaw<Array<{ id: string; quantity: number }>>(Prisma.sql`SELECT "id", "quantity"::double precision AS "quantity" FROM "InventoryStock" WHERE "inventory_item_id" = ${itemId} AND "location" = ${location} FOR UPDATE`);
        const stock = stocks[0];
        if (!stock || stock.quantity < quantity) throw new Error(`Otillräckligt lagersaldo. Tillgängligt: ${stock?.quantity ?? 0} ${item.unit}`);
        await tx.$executeRaw(Prisma.sql`UPDATE "InventoryStock" SET "quantity" = "quantity" - ${quantity}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${stock.id}`);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WorkOrderExecutionEntry" ("id", "company_id", "work_order_id", "created_by_id", "entry_type", "description", "quantity", "unit", "unit_cost", "total_amount", "supplier", "occurred_at", "inventory_item_id", "inventory_transaction_id", "approval_status")
          VALUES (${entryId}, ${user.company_id}, ${id}, ${user.id}, 'material', ${description || item.name}, ${quantity}, ${item.unit}, ${unitCost}, ${quantity * unitCost}, ${body.supplier ? String(body.supplier).trim() : null}, CURRENT_TIMESTAMP, ${itemId}, ${transactionId}, 'pending')
        `);
        await tx.$executeRaw(Prisma.sql`INSERT INTO "InventoryTransaction" ("id", "company_id", "inventory_item_id", "inventory_stock_id", "work_order_id", "execution_entry_id", "actor_user_id", "transaction_type", "quantity", "unit_cost", "reason") VALUES (${transactionId}, ${user.company_id}, ${itemId}, ${stock.id}, ${id}, ${entryId}, ${user.id}, 'issue', ${-quantity}, ${unitCost}, ${description})`);
        await tx.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "actual_cost" = (SELECT COALESCE(SUM("total_amount"), 0) FROM "WorkOrderExecutionEntry" WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND "voided_at" IS NULL), "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`);
      });
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.material_issued", metadata: { itemId, entryId, transactionId, quantity, unitCost, location } });
      return NextResponse.json({ id: entryId }, { status: 201 });
    }

    if (["cost.approve", "cost.reject"].includes(action)) {
      if (!canViewOperations(user.role)) return NextResponse.json({ error: "Endast chef eller administratör kan attestera kostnader" }, { status: 403 });
      const entryId = String(body.entryId || "");
      const status = action === "cost.approve" ? "approved" : "rejected";
      const changed = await db.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderExecutionEntry" SET "approval_status" = ${status}, "approved_by_id" = ${user.id}, "approved_at" = CURRENT_TIMESTAMP,
          "approval_comment" = ${body.comment ? String(body.comment).trim() : null}
        WHERE "id" = ${entryId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND "voided_at" IS NULL
      `);
      if (!changed) return NextResponse.json({ error: "Kostnadsraden hittades inte" }, { status: 404 });
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: `work_order.cost_${status}`, metadata: { entryId, comment: body.comment || null } });
      return NextResponse.json({ success: true });
    }

    if (action === "cost.void") {
      const entryId = String(body.entryId || ""); const reason = String(body.reason || "").trim();
      if (!reason) return NextResponse.json({ error: "Anledning till annullering krävs" }, { status: 400 });
      const entries = await db.$queryRaw<Array<{ id: string; inventory_item_id: string | null; quantity: number; inventory_transaction_id: string | null }>>(Prisma.sql`SELECT "id", "inventory_item_id", "quantity"::double precision AS "quantity", "inventory_transaction_id" FROM "WorkOrderExecutionEntry" WHERE "id" = ${entryId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND "voided_at" IS NULL LIMIT 1`);
      const entry = entries[0]; if (!entry) return NextResponse.json({ error: "Kostnadsraden hittades inte" }, { status: 404 });
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`UPDATE "WorkOrderExecutionEntry" SET "voided_at" = CURRENT_TIMESTAMP, "voided_by_id" = ${user.id}, "void_reason" = ${reason} WHERE "id" = ${entryId}`);
        if (entry.inventory_transaction_id && entry.inventory_item_id) {
          const txRows = await tx.$queryRaw<Array<{ inventory_stock_id: string | null; unit_cost: number }>>(Prisma.sql`SELECT "inventory_stock_id", "unit_cost"::double precision AS "unit_cost" FROM "InventoryTransaction" WHERE "id" = ${entry.inventory_transaction_id} AND "company_id" = ${user.company_id} LIMIT 1`);
          const original = txRows[0];
          if (original?.inventory_stock_id) {
            await tx.$executeRaw(Prisma.sql`UPDATE "InventoryStock" SET "quantity" = "quantity" + ${entry.quantity}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${original.inventory_stock_id}`);
            await tx.$executeRaw(Prisma.sql`INSERT INTO "InventoryTransaction" ("id", "company_id", "inventory_item_id", "inventory_stock_id", "work_order_id", "execution_entry_id", "actor_user_id", "transaction_type", "quantity", "unit_cost", "reason") VALUES (${randomUUID()}, ${user.company_id}, ${entry.inventory_item_id}, ${original.inventory_stock_id}, ${id}, ${entryId}, ${user.id}, 'return', ${entry.quantity}, ${original.unit_cost}, ${reason})`);
          }
        }
        await tx.$executeRaw(Prisma.sql`UPDATE "WorkOrder" SET "actual_cost" = (SELECT COALESCE(SUM("total_amount"), 0) FROM "WorkOrderExecutionEntry" WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND "voided_at" IS NULL), "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`);
      });
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.cost_voided", metadata: { entryId, reason } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Okänd åtgärd" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte hantera material eller attest";
    const conflict = message.includes("Otillräckligt") || message.includes("unique");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
