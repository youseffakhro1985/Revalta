import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageLeases, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, parseDateOnly } from "@/lib/dual-list";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/imd-readings/[id]/attach-notice" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const body = await request.json().catch(() => null) as {
      rentNoticeId?: unknown;
      leaseId?: unknown;
      createNotice?: unknown;
      dueDate?: unknown;
    } | null;

    const reading = await db.imdReading.findFirst({
      where: { id, company_id: user.company_id, property: { deleted_at: null } },
      include: { debit_line: true, property: { select: { id: true, name: true } } },
    });
    if (!reading) {
      const orphaned = await db.imdReading.findFirst({
        where: { id, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Avläsningen hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "imd.reading.created", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ImdReading") {
        return NextResponse.json({
          error: "Avläsningen finns kvar i äldre lagring. Kör backfill till ImdReading innan den kan kopplas till hyresavi.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Avläsningen hittades inte" }, { status: 404 });
    }
    if (reading.voided_at) {
      return NextResponse.json({ error: "Makulerade avläsningar kan inte kopplas till hyresavi" }, { status: 409 });
    }
    if (!reading.debit_line) return NextResponse.json({ error: "Debiteringsrad saknas för avläsningen" }, { status: 409 });
    if (reading.debit_line.status === "linked" && reading.debit_line.rent_notice_id) {
      return NextResponse.json({ error: "Debiteringsraden är redan kopplad till en hyresavi", rentNoticeId: reading.debit_line.rent_notice_id }, { status: 409 });
    }
    if (reading.debit_line.status === "voided") {
      return NextResponse.json({ error: "Makulerade debiteringsrader kan inte kopplas till hyresavi" }, { status: 409 });
    }

    const rentNoticeId = typeof body?.rentNoticeId === "string" ? body.rentNoticeId.trim() : "";
    const leaseId = typeof body?.leaseId === "string" ? body.leaseId.trim() : reading.debit_line.lease_id || "";
    const createNotice = body?.createNotice === true;
    const charge = asNumber(reading.charge);

    let notice = rentNoticeId
      ? await db.rentNotice.findFirst({
          where: {
            id: rentNoticeId,
            company_id: user.company_id,
            property_id: reading.property_id,
            property: { deleted_at: null },
          },
        })
      : null;

    if (!notice && createNotice) {
      if (!leaseId) return NextResponse.json({ error: "Hyresavtal krävs för att skapa avi" }, { status: 400 });
      const lease = await db.lease.findFirst({
        where: { id: leaseId, company_id: user.company_id, property_id: reading.property_id, deleted_at: null },
        include: {
          lease_holder: { select: { name: true } },
          unit: { select: { designation: true } },
        },
      });
      if (!lease) return NextResponse.json({ error: "Hyresavtalet hittades inte" }, { status: 404 });

      const dueDateRaw = typeof body?.dueDate === "string" ? body.dueDate.trim() : "";
      const dueDate = parseDateOnly(dueDateRaw)
        || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
      const baseRent = Number(lease.monthly_rent);
      const indexedRent = baseRent;
      const total = Math.max(0, indexedRent + charge);

      notice = await db.rentNotice.create({
        data: {
          company_id: user.company_id,
          property_id: reading.property_id,
          lease_id: lease.id,
          tenant_name: lease.lease_holder.name,
          unit: lease.unit.designation,
          period: reading.period,
          due_date: dueDate,
          status: "draft",
          base_rent: baseRent,
          index_percent: 0,
          indexed_rent: indexedRent,
          additions: charge,
          deductions: 0,
          total,
          note: `IMD ${reading.meter_type} ${reading.meter_id}`,
          created_by_id: user.id,
        },
      });
    }

    if (!notice) {
      return NextResponse.json({ error: "Ange befintlig hyresavi eller skapa en ny" }, { status: 400 });
    }

    const nextAdditions = asNumber(notice.additions) + charge;
    const nextTotal = Math.max(0, asNumber(notice.indexed_rent) + nextAdditions - asNumber(notice.deductions));

    const updated = await db.$transaction(async (tx) => {
      const debit = await tx.imdDebitLine.updateMany({
        where: {
          id: reading.debit_line!.id,
          company_id: user.company_id!,
          status: "open",
        },
        data: {
          status: "linked",
          rent_notice_id: notice!.id,
          lease_id: notice!.lease_id || leaseId || null,
        },
      });
      if (debit.count === 0) {
        throw new Error("debit_already_linked");
      }

      await tx.rentNotice.updateMany({
        where: { id: notice!.id, company_id: user.company_id! },
        data: {
          additions: nextAdditions,
          total: nextTotal,
          note: [notice!.note, `IMD ${reading.meter_type} ${reading.meter_id}: ${charge.toLocaleString("sv-SE")} kr`]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 1000),
        },
      });

      return tx.imdDebitLine.findFirst({
        where: { id: reading.debit_line!.id, company_id: user.company_id! },
        select: { id: true, status: true, rent_notice_id: true, lease_id: true, charge: true },
      });
    });

    await writeAuditLog(user, {
      entityType: "imd_debit",
      entityId: reading.debit_line.id,
      action: "imd.debit.linked",
      metadata: {
        readingId: reading.id,
        rentNoticeId: notice.id,
        charge,
        propertyId: reading.property_id,
        createdNotice: createNotice && !rentNoticeId,
      },
    });

    return NextResponse.json({
      success: true,
      debit: updated,
      rentNoticeId: notice.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "debit_already_linked") {
      return NextResponse.json({ error: "Debiteringsraden är redan kopplad" }, { status: 409 });
    }
    logger.error("Attach IMD debit error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
