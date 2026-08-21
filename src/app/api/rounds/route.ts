import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { buildChecklistFromLabels, normalizeChecklist } from "@/lib/inspection-round-checklist";
import { normalizeInspectionTemplateItems } from "@/lib/inspection-checklist-template";
import { loadLegacyRows } from "@/lib/dual-list";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/rounds" });
const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function defaultNextDue(interval: string) {
  const nextDue = new Date();
  const days = interval === "weekly" ? 7 : interval === "quarterly" ? 90 : interval === "yearly" ? 365 : 30;
  nextDue.setDate(nextDue.getDate() + days);
  return nextDue;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const [rows, logs] = await Promise.all([
      db.inspectionRound.findMany({
        where: { company_id: user.company_id, property: { deleted_at: null } },
        orderBy: [{ next_due: "asc" }, { created_at: "desc" }],
        take: 300,
        include: { property: { select: { id: true, name: true, address: true, city: true } } },
      }),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), entity_type: "round" },
        orderBy: { created_at: "desc" },
        take: 300,
      })),
    ]);

    const modernIds = new Set(rows.map((row) => row.id));
    const modern = rows.map((row) => {
      const checklist = normalizeChecklist(row.checklist);
      return {
        id: row.id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        title: row.title,
        propertyId: row.property_id,
        propertyName: row.property.name,
        propertyAddress: row.property.address,
        propertyCity: row.property.city,
        interval: row.interval,
        status: row.status,
        nextDue: row.next_due.toISOString(),
        checklist,
        deviations: row.deviations || checklist.filter((item) => item.hasDeviation).length,
        source: "table" as const,
      };
    });

    const legacy = logs
      .filter((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        if (metadata.storage === "InspectionRound") return false;
        return !modernIds.has(log.id) && !(typeof log.entity_id === "string" && modernIds.has(log.entity_id));
      })
      .map((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        return {
          id: log.id,
          createdAt: log.created_at.toISOString(),
          updatedAt: log.created_at.toISOString(),
          ...metadata,
          checklist: normalizeChecklist(metadata.checklist),
          source: "legacy" as const,
        };
      });

    return NextResponse.json({
      rounds: [...modern, ...legacy]
        .sort((a, b) => {
          const aDue = typeof a.nextDue === "string" ? new Date(a.nextDue).getTime() : Number.MAX_SAFE_INTEGER;
          const bDue = typeof b.nextDue === "string" ? new Date(b.nextDue).getTime() : Number.MAX_SAFE_INTEGER;
          return aDue - bDue;
        })
        .slice(0, 300),
      permissions: { canManage: canManageTickets(user.role) },
    }, { headers: noStoreHeaders });
  } catch (error) {
    logger.error("Get rounds error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: noStoreHeaders });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403, headers: noStoreHeaders });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400, headers: noStoreHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Ogiltigt underlag" }, { status: 400, headers: noStoreHeaders });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const interval = typeof body.interval === "string" ? body.interval.trim() : "monthly";
    const checklistTemplateId = typeof body.checklistTemplateId === "string" ? body.checklistTemplateId.trim() : "";
    const customChecklist = Array.isArray(body.checklist)
      ? body.checklist.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 200))
      : [];

    if (!title || title.length > 200 || !propertyId) {
      return NextResponse.json({ error: "Titel och fastighet krävs. Titeln får vara max 200 tecken" }, { status: 400, headers: noStoreHeaders });
    }
    if (!["weekly", "monthly", "quarterly", "yearly"].includes(interval)) {
      return NextResponse.json({ error: "Ogiltigt intervall" }, { status: 400, headers: noStoreHeaders });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404, headers: noStoreHeaders });

    let checklistLabels = customChecklist;
    let templateName = "";
    if (checklistTemplateId) {
      const templates = await db.$queryRaw<Array<{ name: string; items: Prisma.JsonValue }>>(Prisma.sql`
        SELECT "name", "items"
        FROM "InspectionChecklistTemplate"
        WHERE "id" = ${checklistTemplateId} AND "company_id" = ${user.company_id}
        LIMIT 1
      `);
      const template = templates[0];
      if (!template) return NextResponse.json({ error: "Checklistmallen hittades inte" }, { status: 404, headers: noStoreHeaders });
      checklistLabels = normalizeInspectionTemplateItems(template.items);
      templateName = template.name;
    }

    checklistLabels = [...new Set(checklistLabels)].slice(0, 100);
    if (checklistLabels.length === 0) {
      return NextResponse.json({ error: "Minst en kontrollpunkt krävs" }, { status: 400, headers: noStoreHeaders });
    }

    let nextDue = defaultNextDue(interval);
    if (typeof body.nextDue === "string" && body.nextDue.trim()) {
      const parsed = new Date(body.nextDue);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Ogiltigt datum för ronden" }, { status: 400, headers: noStoreHeaders });
      }
      nextDue = parsed;
    }

    const checklistPayload = buildChecklistFromLabels(checklistLabels) as unknown as Prisma.InputJsonValue;

    const round = await db.inspectionRound.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        title,
        interval,
        status: "planned",
        next_due: nextDue,
        checklist: checklistPayload,
        deviations: 0,
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "round",
      entityId: round.id,
      action: "round.created",
      metadata: {
        title,
        propertyId: property.id,
        propertyName: property.name,
        interval,
        status: "planned",
        nextDue: nextDue.toISOString(),
        checklist: checklistPayload,
        checklistTemplateId: checklistTemplateId || null,
        checklistTemplateName: templateName || null,
        deviations: 0,
        storage: "InspectionRound",
      },
    });

    return NextResponse.json({ success: true, round }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    logger.error("Create round error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: noStoreHeaders });
  }
}
