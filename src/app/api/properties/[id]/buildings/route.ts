import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/properties/[id]/buildings" });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa byggnader" }, { status: 403 });
    }

    const { id } = await params;
    const property = await db.property.findFirst({ where: { id, deleted_at: null, ...tenantWhere(user) } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
    const constructionYear = body.constructionYear === "" || body.constructionYear == null ? null : Number(body.constructionYear);
    const floors = body.floors === "" || body.floors == null ? null : Number(body.floors);

    if (name.length < 2) {
      return NextResponse.json({ error: "Byggnadens namn måste anges" }, { status: 400 });
    }
    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return NextResponse.json({ error: "Ange ett giltigt byggår" }, { status: 400 });
    }
    if (floors !== null && (!Number.isInteger(floors) || floors < 0 || floors > 200)) {
      return NextResponse.json({ error: "Ange ett giltigt antal våningar" }, { status: 400 });
    }

    const building = await db.building.create({
      data: { property_id: id, name, address, construction_year: constructionYear, floors },
    });

    await writeAuditLog(user, {
      entityType: "building",
      entityId: building.id,
      action: "building.created",
      metadata: { propertyId: id, name },
    });

    return NextResponse.json({ success: true, building }, { status: 201 });
  } catch (error) {
    logger.error("Create building error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}