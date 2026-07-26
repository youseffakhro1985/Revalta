import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { isOccupyingLeaseStatus, parseLeaseInput } from "@/lib/leasing";

const leasableUnitTypes = ["apartment", "commercial", "storage", "garage", "parking", "other"];

function serializeLease(lease: {
  monthly_rent: Prisma.Decimal;
  deposit: Prisma.Decimal;
  annual_index_percent: Prisma.Decimal;
  [key: string]: unknown;
}) {
  return {
    ...lease,
    monthly_rent: Number(lease.monthly_rent),
    annual_rent: Number(lease.monthly_rent) * 12,
    deposit: Number(lease.deposit),
    annual_index_percent: Number(lease.annual_index_percent),
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera avtal" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseLeaseInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data;

    const existing = await db.lease.findFirst({
      where: { id, company_id: user.company_id },
      include: { lease_holder: true },
    });
    if (!existing) return NextResponse.json({ error: "Avtalet hittades inte" }, { status: 404 });
    if (body.updatedAt && new Date(String(body.updatedAt)).getTime() !== existing.updated_at.getTime()) {
      return NextResponse.json({ error: "Avtalet har ändrats av någon annan. Ladda om och försök igen." }, { status: 409 });
    }

    const lease = await db.$transaction(async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: input.unitId, status: "active", property: { company_id: user.company_id! } },
        include: { property: { select: { id: true, name: true, address: true, city: true } } },
      });
      if (!unit || !leasableUnitTypes.includes(unit.unit_type)) throw new LeaseRequestError("Objektet hittades inte", 404);

      if (isOccupyingLeaseStatus(input.status)) {
        const conflict = await tx.lease.findFirst({
          where: { id: { not: existing.id }, unit_id: unit.id, company_id: user.company_id!, status: { in: ["reserved", "active", "notice"] } },
          select: { lease_number: true },
        });
        if (conflict) throw new LeaseRequestError(`Objektet har redan ett pågående avtal (${conflict.lease_number})`, 409);
      }

      const holderId = input.holderId || existing.lease_holder_id;
      const holder = await tx.leaseHolder.findFirst({ where: { deleted_at: null, id: holderId, company_id: user.company_id! } });
      if (!holder) throw new LeaseRequestError("Hyresparten hittades inte", 400);
      const holderUpdate = await tx.leaseHolder.updateMany({
        where: { deleted_at: null, id: holder.id, company_id: user.company_id! },
        data: {
          party_type: input.holderType,
          name: input.holderName,
          contact_name: input.holderContactName,
          email: input.holderEmail,
          phone: input.holderPhone,
          organization_number: input.holderOrganizationNumber,
        },
      });
      if (holderUpdate.count === 0) throw new LeaseRequestError("Hyresparten hittades inte", 400);

      const updated = await tx.lease.updateMany({
        where: { id: existing.id, company_id: user.company_id!, updated_at: existing.updated_at },
        data: {
          property_id: unit.property_id,
          unit_id: unit.id,
          lease_holder_id: holder.id,
          lease_number: input.leaseNumber || existing.lease_number,
          status: input.status,
          start_date: input.startDate,
          end_date: input.endDate,
          notice_date: input.noticeDate,
          monthly_rent: input.monthlyRent,
          deposit: input.deposit,
          annual_index_percent: input.annualIndexPercent,
          payment_terms_days: input.paymentTermsDays,
          note: input.note,
          ended_at: input.status === "ended" || input.status === "cancelled" ? existing.ended_at || new Date() : null,
        },
      });
      if (updated.count !== 1) throw new LeaseRequestError("Avtalet har ändrats av någon annan. Ladda om och försök igen.", 409);

      const result = await tx.lease.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          property: { select: { id: true, name: true, address: true, city: true } },
          unit: { select: { id: true, designation: true, unit_type: true, floor: true, area: true, status: true } },
          lease_holder: true,
          created_by: { select: { id: true, name: true, email: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease",
          entity_id: result.id,
          action: "lease.v2.updated",
          metadata: {
            leaseNumber: result.lease_number,
            previousStatus: existing.status,
            status: result.status,
            previousUnitId: existing.unit_id,
            unitId: result.unit_id,
            leaseHolderId: result.lease_holder_id,
            monthlyRent: result.monthly_rent.toString(),
          },
        },
      });
      return result;
    });

    return NextResponse.json({ lease: serializeLease(lease) });
  } catch (error) {
    if (error instanceof LeaseRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Avtalsnumret används redan eller objektet har ett annat pågående avtal" }, { status: 409 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Ogiltigt JSON-underlag" }, { status: 400 });
    console.error("Update lease error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

class LeaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
