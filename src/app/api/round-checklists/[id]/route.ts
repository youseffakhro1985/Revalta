import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { normalizeInspectionTemplateItems, parseInspectionTemplatePayload } from "@/lib/inspection-checklist-template";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/round-checklists/[id]" });
const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  items: Prisma.JsonValue;
  created_by_id: string;
  created_at: Date;
  updated_at: Date;
  created_by_name: string | null;
  created_by_email: string;
};

function serialize(row: TemplateRow) {
  const items = normalizeInspectionTemplateItems(row.items);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || "",
    items,
    itemCount: items.length,
    createdBy: row.created_by_name || row.created_by_email,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = parseInspectionTemplatePayload(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: noStoreHeaders });

    const now = new Date();
    const itemsJson = JSON.stringify(parsed.data.items);
    const rows = await db.$queryRaw<TemplateRow[]>(Prisma.sql`
      WITH updated AS (
        UPDATE "InspectionChecklistTemplate"
        SET
          "name" = ${parsed.data.name},
          "category" = ${parsed.data.category},
          "description" = ${parsed.data.description || null},
          "items" = ${itemsJson}::jsonb,
          "updated_at" = ${now}
        WHERE "id" = ${id} AND "company_id" = ${user.company_id}
        RETURNING *
      )
      SELECT
        u2."id",
        u2."name",
        u2."category",
        u2."description",
        u2."items",
        u2."created_by_id",
        u2."created_at",
        u2."updated_at",
        usr."name" AS "created_by_name",
        usr."email" AS "created_by_email"
      FROM updated u2
      INNER JOIN "User" usr ON usr."id" = u2."created_by_id"
    `);

    const template = rows[0];
    if (!template) return NextResponse.json({ error: "Checklistan hittades inte" }, { status: 404, headers: noStoreHeaders });

    await writeAuditLog(user, {
      entityType: "round_checklist_template",
      entityId: id,
      action: "round.checklist_template_updated",
      metadata: {
        name: parsed.data.name,
        category: parsed.data.category,
        itemCount: parsed.data.items.length,
        storage: "InspectionChecklistTemplate",
      },
    });

    return NextResponse.json({ template: serialize(template) }, { headers: noStoreHeaders });
  } catch (error) {
    logger.error("Update round checklist template error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const { id } = await params;
    const rows = await db.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      DELETE FROM "InspectionChecklistTemplate"
      WHERE "id" = ${id} AND "company_id" = ${user.company_id}
      RETURNING "id", "name"
    `);
    const deleted = rows[0];
    if (!deleted) return NextResponse.json({ error: "Checklistan hittades inte" }, { status: 404, headers: noStoreHeaders });

    await writeAuditLog(user, {
      entityType: "round_checklist_template",
      entityId: id,
      action: "round.checklist_template_deleted",
      metadata: { name: deleted.name, storage: "InspectionChecklistTemplate" },
    });

    return NextResponse.json({ success: true }, { headers: noStoreHeaders });
  } catch (error) {
    logger.error("Delete round checklist template error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}
