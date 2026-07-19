import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalInteger(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; buildingId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) return NextResponse.json({ error: "Du saknar behörighet att redigera byggnader" }, { status: 403 });

    const { id, buildingId } = await params;
    const building = await db.building.findFirst({
      where: { id: buildingId, property_id: id, property: tenantWhere(user) },
    });
    if (!building) return NextResponse.json({ error: "Byggnaden hittades inte" }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = optionalText(body?.name);
    const address = optionalText(body?.address);
    const constructionYear = optionalInteger(body?.constructionYear);
    const floors = optionalInteger(body?.floors);

    if (!name || name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: "Byggnadens namn måste vara mellan 2 och 120 tecken" }, { status: 400 });
    }
    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return NextResponse.json({ error: "Ange ett giltigt byggår" }, { status: 400 });
    }
    if (floors !== null && (!Number.isInteger(floors) || floors < 0 || floors > 200)) {
      return NextResponse.json({ error: "Ange ett giltigt antal våningar" }, { status: 400 });
    }

    const updated = await db.building.update({
      where: { id: building.id },
      data: { name, address, construction_year: constructionYear, floors },
      include: { _count: { select: { units: true } } },
    });

    await writeAuditLog(user, {
      entityType: "building",
      entityId: building.id,
      action: "building.updated",
      metadata: { propertyId: id, name: updated.name },
    });

    return NextResponse.json({ success: true, building: updated });
  } catch (error) {
    console.error("Update building error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; buildingId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) return NextResponse.json({ error: "Du saknar behörighet att ta bort byggnader" }, { status: 403 });

    const { id, buildingId } = await params;
    const building = await db.building.findFirst({
      where: { id: buildingId, property_id: id, property: tenantWhere(user) },
      include: { _count: { select: { units: true } } },
    });
    if (!building) return NextResponse.json({ error: "Byggnaden hittades inte" }, { status: 404 });
    if (building._count.units > 0) {
      return NextResponse.json({ error: "Flytta eller ta bort byggnadens objekt innan byggnaden tas bort" }, { status: 409 });
    }

    await db.building.delete({ where: { id: building.id } });
    await writeAuditLog(user, {
      entityType: "building",
      entityId: building.id,
      action: "building.deleted",
      metadata: { propertyId: id, name: building.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete building error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
