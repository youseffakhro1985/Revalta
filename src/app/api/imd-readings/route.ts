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

    const [rows, logs, properties, leases] = await Promise.all([
      user.company_id
        ? db.imdReading.findMany({
            where: { company_id: user.company_id, voided_at: null },
            orderBy: { created_at: "desc" },
            take: 500,
            include: {
              debit_line: {
                select: {
                  id: true,
                  status: true,
                  rent_notice_id: true,
                  lease_id: true,
                  charge: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
      user.company_id
        ? db.lease.findMany({
            where: { company_id: user.company_id, deleted_at: null, status: { in: ["active", "notice"] } },
            orderBy: { updated_at: "desc" },
            take: 500,
            select: {
              id: true,
              property_id: true,
              lease_number: true,
              unit: { select: { designation: true } },
              lease_holder: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
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
      debit: row.debit_line
        ? {
            id: row.debit_line.id,
            status: row.debit_line.status,
            rent_notice_id: row.debit_line.rent_notice_id,
            lease_id: row.debit_line.lease_id,
            charge: asNumber(row.debit_line.charge),
          }
        : null,
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
        debit: null,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      readings: mergeByCreatedAt(modern, legacy, 500),
      properties,
      leases: leases.map((lease) => ({
        id: lease.id,
        property_id: lease.property_id,
        lease_number: lease.lease_number,
        unit: lease.unit.designation,
        tenant_name: lease.lease_holder.name,
      })),
    });
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
    const leaseId = String(body.leaseId || "").trim();
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
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    let resolvedLeaseId: string | null = null;
    let resolvedUnit = unit;
    if (leaseId) {
      const lease = await db.lease.findFirst({
        where: { id: leaseId, company_id: user.company_id, property_id: property.id, deleted_at: null },
        select: { id: true, unit: { select: { designation: true } } },
      });
      if (!lease) return NextResponse.json({ error: "Hyresavtalet hittades inte för fastigheten" }, { status: 404 });
      resolvedLeaseId = lease.id;
      resolvedUnit = lease.unit.designation || unit;
    }

    const consumption = currentReading - previousReading;
    const charge = consumption * unitPrice;

    const created = await db.$transaction(async (tx) => {
      const reading = await tx.imdReading.create({
        data: {
          company_id: user.company_id!,
          property_id: property.id,
          property_name: property.name,
          unit: resolvedUnit,
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

      const debit = await tx.imdDebitLine.create({
        data: {
          company_id: user.company_id!,
          imd_reading_id: reading.id,
          property_id: property.id,
          lease_id: resolvedLeaseId,
          unit: resolvedUnit,
          meter_id: meterId,
          meter_type: type,
          period,
          consumption,
          unit_price: unitPrice,
          charge,
          status: "open",
          created_by_id: user.id,
        },
        select: { id: true, status: true },
      });

      return { reading, debit };
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        readingId: created.reading.id,
        debitLineId: created.debit.id,
        property_name: property.name,
        unit: resolvedUnit,
        meter_id: meterId,
        meter_type: type,
        period,
        previous_reading: previousReading,
        current_reading: currentReading,
        consumption,
        unit_price: unitPrice,
        charge,
        note,
        leaseId: resolvedLeaseId,
        storage: "ImdReading",
      },
    });

    return NextResponse.json({ success: true, reading: created.reading, debit: created.debit }, { status: 201 });
  } catch (error) {
    console.error("Create IMD reading error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    const companyId = user.company_id;

    const body = await request.json();
    const readingId = String(body.readingId || body.id || "").trim();
    const voidAction = body.action === "void" || body.void === true;
    if (!readingId || !voidAction) {
      return NextResponse.json({ error: "Avläsnings-id och åtgärden makulera krävs" }, { status: 400 });
    }

    const existing = await db.imdReading.findFirst({
      where: { id: readingId, company_id: companyId, voided_at: null },
      select: {
        id: true,
        property_id: true,
        meter_id: true,
        period: true,
        debit_line: { select: { id: true, rent_notice_id: true, status: true } },
      },
    });
    if (!existing) {
      const alreadyVoided = await db.imdReading.findFirst({
        where: { id: readingId, company_id: companyId },
        select: { id: true, voided_at: true },
      });
      if (alreadyVoided?.voided_at) {
        return NextResponse.json({ error: "Avläsningen är redan makulerad" }, { status: 409 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: readingId },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ImdReading") {
        return NextResponse.json({
          error: "Avläsningen finns kvar i äldre lagring. Kör backfill till ImdReading innan den kan makuleras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Avläsningen hittades inte" }, { status: 404 });
    }

    if (existing.debit_line?.rent_notice_id) {
      return NextResponse.json({
        error: "Avläsningen är kopplad till en hyresavi och kan inte makuleras.",
        rentNoticeId: existing.debit_line.rent_notice_id,
      }, { status: 409 });
    }

    const now = new Date();
    await db.$transaction(async (tx) => {
      const updated = await tx.imdReading.updateMany({
        where: { id: existing.id, company_id: companyId, voided_at: null },
        data: { voided_at: now },
      });
      if (updated.count !== 1) {
        throw new Error("IMD_VOID_CONFLICT");
      }
      if (existing.debit_line) {
        await tx.imdDebitLine.updateMany({
          where: {
            id: existing.debit_line.id,
            company_id: companyId,
            rent_notice_id: null,
          },
          data: { status: "voided" },
        });
      }
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: existing.property_id,
      action: "imd.reading.voided",
      metadata: {
        readingId: existing.id,
        debitLineId: existing.debit_line?.id ?? null,
        meter_id: existing.meter_id,
        period: existing.period,
        storage: "ImdReading",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, voided_at: now.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "IMD_VOID_CONFLICT") {
      return NextResponse.json({ error: "Avläsningen kunde inte makuleras. Ladda om och försök igen." }, { status: 409 });
    }
    console.error("Void IMD reading error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
