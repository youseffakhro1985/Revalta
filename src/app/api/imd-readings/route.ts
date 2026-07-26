import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, mergeByCreatedAt } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "imd.reading.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [rows, logs, properties] = await Promise.all([
      user.company_id
        ? db.imdReading.findMany({
            where: { company_id: user.company_id },
            orderBy: { created_at: "desc" },
            take: 500,
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property_name,
      unit: row.unit,
      meter_id: row.meter_id,
      meter_type: row.meter_type,
      period: row.period,
      previous_reading: asNumber(row.previous_reading),
      current_reading: asNumber(row.current_reading),
      consumption: asNumber(row.consumption),
      unit_price: asNumber(row.unit_price),
      charge: asNumber(row.charge),
      note: row.note || "",
      created_at: row.created_at,
      source: "table" as const,
    }));

    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = logs
      .filter((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        return metadata.storage !== "ImdReading" && !modernIds.has(log.id);
      })
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({ readings: mergeByCreatedAt(modern, legacy, 500), properties });
  } catch (error) {
    console.error("Get IMD readings error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const unit = String(body.unit || "").trim();
    const meterId = String(body.meterId || "").trim();
    const type = String(body.type || "electricity").trim();
    const period = String(body.period || "").trim();
    const previousReading = Number(body.previousReading || 0);
    const currentReading = Number(body.currentReading || 0);
    const unitPrice = Number(body.unitPrice || 0);
    const note = String(body.note || "").trim();
    const allowedTypes = new Set(["electricity", "hot_water", "cold_water", "heating"]);
    if (!propertyId || !unit || !meterId || !period || !allowedTypes.has(type)) {
      return NextResponse.json({ error: "Fyll i fastighet, objekt, mätare, typ och period" }, { status: 400 });
    }
    if (![previousReading, currentReading, unitPrice].every((value) => Number.isFinite(value) && value >= 0) || currentReading < previousReading) {
      return NextResponse.json({ error: "Kontrollera avläsningar och pris" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const consumption = currentReading - previousReading;
    const charge = consumption * unitPrice;
    const reading = await db.imdReading.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        property_name: property.name,
        unit,
        meter_id: meterId,
        meter_type: type,
        period,
        previous_reading: previousReading,
        current_reading: currentReading,
        consumption,
        unit_price: unitPrice,
        charge,
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        readingId: reading.id,
        property_name: property.name,
        unit,
        meter_id: meterId,
        meter_type: type,
        period,
        previous_reading: previousReading,
        current_reading: currentReading,
        consumption,
        unit_price: unitPrice,
        charge,
        note,
        storage: "ImdReading",
      },
    });

    return NextResponse.json({ success: true, reading }, { status: 201 });
  } catch (error) {
    console.error("Create IMD reading error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
