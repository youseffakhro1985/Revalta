import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

const allowedTypes = new Set(["apartment", "commercial", "storage", "garage", "parking", "technical", "other"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa objekt" }, { status: 403 });
    }

    const { id } = await params;
    const property = await db.property.findFirst({ where: { id, ...tenantWhere(user) } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const body = await request.json();
    const designation = typeof body.designation === "string" ? body.designation.trim() : "";
    const unitType = typeof body.unitType === "string" && allowedTypes.has(body.unitType) ? body.unitType : "apartment";
    const floor = typeof body.floor === "string" && body.floor.trim() ? body.floor.trim() : null;
    const area = body.area === "" || body.area == null ? null : Number(body.area);
    const rooms = body.rooms === "" || body.rooms == null ? null : Number(body.rooms);
    const buildingId = typeof body.buildingId === "string" && body.buildingId ? body.buildingId : null;

    if (!designation) return NextResponse.json({ error: "Objektets beteckning måste anges" }, { status: 400 });
    if (area !== null && (!Number.isFinite(area) || area < 0)) {
      return NextResponse.json({ error: "Ange en giltig area" }, { status: 400 });
    }
    if (rooms !== null && (!Number.isFinite(rooms) || rooms < 0)) {
      return NextResponse.json({ error: "Ange ett giltigt antal rum" }, { status: 400 });
    }

    if (buildingId) {
      const building = await db.building.findFirst({ where: { id: buildingId, property_id: id } });
      if (!building) return NextResponse.json({ error: "Byggnaden tillhör inte fastigheten" }, { status: 400 });
    }

    const unit = await db.unit.create({
      data: {
        property_id: id,
        building_id: buildingId,
        designation,
        unit_type: unitType,
        floor,
        area,
        rooms,
      },
      include: { building: { select: { name: true } } },
    });

    await writeAuditLog(user, {
      entityType: "unit",
      entityId: unit.id,
      action: "unit.created",
      metadata: { propertyId: id, designation, unitType },
    });

    return NextResponse.json({ success: true, unit }, { status: 201 });
  } catch (error) {
    console.error("Create unit error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}