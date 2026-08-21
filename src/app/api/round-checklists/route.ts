import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { normalizeInspectionTemplateItems, parseInspectionTemplatePayload } from "@/lib/inspection-checklist-template";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/round-checklists" });
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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const rows = await db.$queryRaw<TemplateRow[]>(Prisma.sql`
      SELECT
        t."id",
        t."name",
        t."category",
        t."description",
        t."items",
        t."created_by_id",
        t."created_at",
        t."updated_at",
        u."name" AS "created_by_name",
        u."email" AS "created_by_email"
      FROM "InspectionChecklistTemplate" t
      INNER JOIN "User" u ON u."id" = t."created_by_id"
      WHERE t."company_id" = ${user.company_id}
      ORDER BY t."updated_at" DESC, t."name" ASC
      LIMIT 300
    `);

    return NextResponse.json({
      templates: rows.map(serialize),
      permissions: { canManage: canManageTickets(user.role) },
    }, { headers: noStoreHeaders });
  } catch (error) {
    logger.error("Get round checklist templates error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const body = await request.json().catch(() => null);
    const parsed = parseInspectionTemplatePayload(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: noStoreHeaders });

    const id = crypto.randomUUID();
    const now = new Date();
    const itemsJson = JSON.stringify(parsed.data.items);

    const rows = await db.$queryRaw<TemplateRow[]>(Prisma.sql`
      WITH inserted AS (
        INSERT INTO "InspectionChecklistTemplate" (
          "id", "company_id", "name", "category", "description", "items", "created_by_id", "created_at", "updated_at"
        ) VALUES (
          ${id}, ${user.company_id}, ${parsed.data.name}, ${parsed.data.category}, ${parsed.data.description || null},
          ${itemsJson}::jsonb, ${user.id}, ${now}, ${now}
        )
        RETURNING *
      )
      SELECT
        i."id",
        i."name",
        i."category",
        i."description",
        i."items",
        i."created_by_id",
        i."created_at",
        i."updated_at",
        u."name" AS "created_by_name",
        u."email" AS "created_by_email"
      FROM inserted i
      INNER JOIN "User" u ON u."id" = i."created_by_id"
    `);

    const template = rows[0];
    if (!template) throw new Error("Checklist template insert returned no row");

    await writeAuditLog(user, {
      entityType: "round_checklist_template",
      entityId: id,
      action: "round.checklist_template_created",
      metadata: {
        name: parsed.data.name,
        category: parsed.data.category,
        itemCount: parsed.data.items.length,
        storage: "InspectionChecklistTemplate",
      },
    });

    return NextResponse.json({ template: serialize(template) }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    logger.error("Create round checklist template error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}
