import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

const allowedTypes = new Set(["apartment", "commercial", "storage", "garage", "parking", "technical", "other"]);
const allowedStatuses = new Set(["active", "vacant", "maintenance", "inactive"]);

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) return NextResponse.json({ error: "Du saknar behörighet att redigera objekt" }, { status: 403 });

    const { id, unitId } = await params;
    const unit = await db.unit.findFirst({
      where: { id: unitId, property_id: id, property: tenantWhere(user) },
    });
    if (!unit) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const designation = optionalText(body?.designation);
    const unitType = typeof body?.unitType === "string" && allowedTypes.has(body.unitType) ? body.unitType : null;
    const status = typeof body?.status === "string" && allowedStatuses.has(body.status) ? body.status : null;
    const floor = optionalText(body?.floor);
    const area = optionalNumber(body?.area);
    const rooms = optionalNumber(body?.rooms);
    const buildingId = optionalText(body?.buildingId);

    if (!designation || designation.length > 80) {
      return NextResponse.json({ error: "Objektets beteckning måste anges och får vara högst 80 tecken" }, { status: 400 });
    }
    if (!unitType) return NextResponse.json({ error: "Ange en giltig objekttyp" }, { status: 400 });
    if (!status) return NextResponse.json({ error: "Ange en giltig status" }, { status: 400 });
    if (area !== null && (!Number.isFinite(area) || area < 0 || area > 1_000_000)) {
      return NextResponse.json({ error: "Ange en giltig area" }, { status: 400 });
    }
    if (rooms !== null && (!Number.isFinite(rooms) || rooms < 0 || rooms > 100)) {
      return NextResponse.json({ error: "Ange ett giltigt antal rum" }, { status: 400 });
    }

    if (buildingId) {
      const building = await db.building.findFirst({
        where: { id: buildingId, property_id: id, property: tenantWhere(user) },
        select: { id: true },
      });
      if (!building) return NextResponse.json({ error: "Byggnaden tillhör inte fastigheten" }, { status: 400 });
    }

    const duplicate = await db.unit.findFirst({
      where: { property_id: id, designation, id: { not: unit.id } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "Det finns redan ett objekt med samma beteckning i fastigheten" }, { status: 409 });

    const updated = await db.unit.update({
      where: { id: unit.id },
      data: { designation, unit_type: unitType, status, floor, area, rooms, building_id: buildingId },
      include: { building: { select: { id: true, name: true } } },
    });

    await writeAuditLog(user, {
      entityType: "unit",
      entityId: unit.id,
      action: "unit.updated",
      metadata: { propertyId: id, designation: updated.designation, unitType: updated.unit_type },
    });

    return NextResponse.json({ success: true, unit: updated });
  } catch (error) {
    console.error("Update unit error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) return NextResponse.json({ error: "Du saknar behörighet att ta bort objekt" }, { status: 403 });

    const { id, unitId } = await params;
    const unit = await db.unit.findFirst({
      where: { id: unitId, property_id: id, property: tenantWhere(user) },
      include: { _count: { select: { leases: true, work_orders: true } } },
    });
    if (!unit) return NextResponse.json({ error: "Objektet hittades inte" }, { status: 404 });
    if (unit._count.leases > 0 || unit._count.work_orders > 0) {
      return NextResponse.json({ error: "Objektet kan inte tas bort eftersom det har avtal eller arbetsorder kopplade till sig" }, { status: 409 });
    }

    await db.unit.delete({ where: { id: unit.id } });
    await writeAuditLog(user, {
      entityType: "unit",
      entityId: unit.id,
      action: "unit.deleted",
      metadata: { propertyId: id, designation: unit.designation },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete unit error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
