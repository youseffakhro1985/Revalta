import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageLeases, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dual-list";
import { createRouteObservability } from "@/lib/route-observability";

class AttachConflict extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, "/api/imd-readings/[id]/attach-notice");
  const respond = (body: unknown, status = 200) => observability.correlate(NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" },
  }));
  try {
    const user = await getCurrentUser();
    if (!user) return respond({ error: "Obehörig" }, 401);
    if (!canManageLeases(user.role)) return respond({ error: "Du saknar behörighet" }, 403);
    if (!user.company_id) return respond({ error: "Användaren saknar organisation" }, 400);
    const companyId = user.company_id;
    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "Ogiltig begäran" }, 400);
    const rentNoticeId = typeof body.rentNoticeId === "string" ? body.rentNoticeId.trim() : "";
    const requestedLeaseId = typeof body.leaseId === "string" ? body.leaseId.trim() : "";
    const createNotice = body.createNotice === true;
    if ((!rentNoticeId && !createNotice) || (rentNoticeId && createNotice)) {
      return respond({ error: "Välj en befintlig hyresavi eller skapa en ny" }, 400);
    }
    const dueDateRaw = typeof body.dueDate === "string" ? body.dueDate.trim() : "";
    const parsedDueDate = parseDateOnly(dueDateRaw);
    if (body.dueDate !== undefined && !parsedDueDate) return respond({ error: "Ogiltigt förfallodatum" }, 400);

    // All reads, the debit claim, the notice and its audit share one snapshot.
    // Concurrent edits/attachments fail with 409 rather than overwriting money.
    const result = await db.$transaction(async (tx) => {
      const reading = await tx.imdReading.findFirst({
        where: { id, company_id: companyId, property: { deleted_at: null } },
        include: { debit_line: true },
      });
      if (!reading) {
        const legacy = await tx.auditLog.findFirst({
          where: { ...auditScopedWhere(user), action: "imd.reading.created", id },
          select: { metadata: true },
        });
        const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
        if (legacy && metadata.storage !== "ImdReading") {
          throw new AttachConflict("Avläsningen finns i äldre lagring och behöver backfill innan den kan kopplas till hyresavi.");
        }
        throw new AttachConflict("Avläsningen hittades inte", 404);
      }
      if (reading.voided_at) throw new AttachConflict("Makulerade avläsningar kan inte kopplas till hyresavi");
      const debit = reading.debit_line;
      if (!debit) throw new AttachConflict("Debiteringsrad saknas för avläsningen");
      if (debit.status !== "open" || debit.rent_notice_id) throw new AttachConflict("Debiteringsraden är inte öppen för koppling");
      const charge = new Prisma.Decimal(reading.charge);
      if (debit.company_id !== companyId || debit.property_id !== reading.property_id
        || debit.unit !== reading.unit || debit.period !== reading.period
        || !charge.isFinite() || charge.isNegative() || !charge.equals(debit.charge)) {
        throw new AttachConflict("Avläsningen och debiteringsraden stämmer inte överens. Kontrollera underlaget.");
      }
      if (requestedLeaseId && debit.lease_id && requestedLeaseId !== debit.lease_id) {
        throw new AttachConflict("Hyresavtalet stämmer inte med debiteringsraden");
      }

      let notice = rentNoticeId ? await tx.rentNotice.findFirst({
        where: { id: rentNoticeId, company_id: companyId, property_id: reading.property_id, property: { deleted_at: null } },
      }) : null;
      if (rentNoticeId && !notice) throw new AttachConflict("Hyresavin hittades inte", 404);
      if (notice && (notice.status !== "draft" || notice.unit !== reading.unit || notice.period !== reading.period)) {
        throw new AttachConflict("Välj ett utkast för samma objekt och period som avläsningen");
      }
      const leaseId = requestedLeaseId || debit.lease_id || notice?.lease_id || "";
      if (!leaseId || (notice && notice.lease_id !== leaseId)) {
        throw new AttachConflict("Ett verifierat hyresavtal krävs för kopplingen");
      }
      const lease = await tx.lease.findFirst({
        where: {
          id: leaseId, company_id: companyId, property_id: reading.property_id, deleted_at: null,
          property: { deleted_at: null },
          unit: { property_id: reading.property_id, designation: reading.unit },
        },
        include: { lease_holder: { select: { name: true } }, unit: { select: { designation: true } } },
      });
      if (!lease) throw new AttachConflict("Hyresavtalet för objektet hittades inte", 404);

      if (!notice) {
        const now = new Date();
        const baseRent = new Prisma.Decimal(lease.monthly_rent);
        notice = await tx.rentNotice.create({
          data: {
            company_id: companyId, property_id: reading.property_id, lease_id: lease.id,
            tenant_name: lease.lease_holder.name, unit: lease.unit.designation, period: reading.period,
            due_date: parsedDueDate || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
            status: "draft", base_rent: baseRent, index_percent: 0, indexed_rent: baseRent,
            // The single debit increment below is shared with existing notices.
            additions: 0, deductions: 0, total: baseRent, created_by_id: user.id,
          },
        });
      }
      const claimed = await tx.imdDebitLine.updateMany({
        where: { id: debit.id, company_id: companyId, status: "open", rent_notice_id: null, updated_at: debit.updated_at },
        data: { status: "linked", rent_notice_id: notice.id, lease_id: lease.id },
      });
      if (claimed.count !== 1) throw new AttachConflict("Debiteringsraden har ändrats. Ladda om och försök igen.");
      const additions = new Prisma.Decimal(notice.additions).plus(charge);
      const total = Prisma.Decimal.max(0, new Prisma.Decimal(notice.indexed_rent).plus(additions).minus(notice.deductions));
      const changed = await tx.rentNotice.updateMany({
        where: { id: notice.id, company_id: companyId, status: "draft", updated_at: notice.updated_at },
        data: {
          additions, total,
          note: [notice.note, `IMD ${reading.meter_type} ${reading.meter_id}: ${charge.toFixed(2)} kr`].filter(Boolean).join(" · ").slice(0, 1000),
        },
      });
      if (changed.count !== 1) throw new AttachConflict("Hyresavin har ändrats. Ladda om och försök igen.");
      await writeAuditLog(user, {
        entityType: "imd_debit", entityId: debit.id, action: "imd.debit.linked",
        metadata: { readingId: reading.id, rentNoticeId: notice.id, charge: charge.toNumber(), propertyId: reading.property_id, createdNotice: createNotice },
      }, tx);
      return {
        debit: await tx.imdDebitLine.findFirst({
          where: { id: debit.id, company_id: companyId },
          select: { id: true, status: true, rent_notice_id: true, lease_id: true, charge: true },
        }),
        rentNoticeId: notice.id,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return respond({ success: true, ...result });
  } catch (error) {
    if (error instanceof AttachConflict) return respond({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return respond({ error: "Underlaget ändrades samtidigt. Ladda om och försök igen." }, 409);
    }
    observability.logger.error("imd.debit.attach_failed", undefined, observability.elapsed());
    return respond({ error: "Kopplingen kunde inte slutföras. Försök igen." }, 500);
  }
}
