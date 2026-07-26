import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { generateLeaseNumber, isOccupyingLeaseStatus, parseLeaseInput } from "@/lib/leasing";

const leasableUnitTypes = ["apartment", "commercial", "storage", "garage", "parking", "other"];

function leaseResponse(lease: {
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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [leases, properties, holders] = await Promise.all([
      db.lease.findMany({
        where: { company_id: user.company_id },
        orderBy: [{ status: "asc" }, { updated_at: "desc" }],
        take: 1_000,
        include: {
          property: { select: { id: true, name: true, address: true, city: true } },
          unit: { select: { id: true, designation: true, unit_type: true, floor: true, area: true, status: true } },
          lease_holder: true,
          created_by: { select: { id: true, name: true, email: true } },
        },
      }),
      db.property.findMany({
        where: { company_id: user.company_id, status: { not: "sold" } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          units: {
            where: { status: "active", unit_type: { in: leasableUnitTypes } },
            orderBy: { designation: "asc" },
            select: { id: true, designation: true, unit_type: true, floor: true, area: true, rooms: true, status: true },
          },
        },
      }),
      db.leaseHolder.findMany({
        where: { company_id: user.company_id, status: "active" },
        orderBy: { name: "asc" },
        take: 1_000,
      }),
    ]);

    return NextResponse.json({
      leases: leases.map(leaseResponse),
      properties,
      holders,
      permissions: { canManage: canManageLeases(user.role) },
    });
  } catch (error) {
    console.error("Get leases error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera avtal" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseLeaseInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.data;

    const lease = await db.$transaction(async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: input.unitId, status: "active", property: { company_id: user.company_id! } },
        include: { property: { select: { id: true, name: true, address: true, city: true } } },
      });
      if (!unit || !leasableUnitTypes.includes(unit.unit_type)) throw new LeaseRequestError("Objektet hittades inte", 404);

      if (isOccupyingLeaseStatus(input.status)) {
        const conflict = await tx.lease.findFirst({
          where: { unit_id: unit.id, company_id: user.company_id!, status: { in: ["reserved", "active", "notice"] } },
          select: { lease_number: true },
        });
        if (conflict) throw new LeaseRequestError(`Objektet har redan ett pågående avtal (${conflict.lease_number})`, 409);
      }

      let holder;
      if (input.holderId) {
        const existingHolder = await tx.leaseHolder.findFirst({ where: { id: input.holderId, company_id: user.company_id! } });
        if (!existingHolder) throw new LeaseRequestError("Hyresparten hittades inte", 400);
        const holderUpdate = await tx.leaseHolder.updateMany({
          where: { id: existingHolder.id, company_id: user.company_id! },
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
        holder = await tx.leaseHolder.findFirst({
          where: { id: existingHolder.id, company_id: user.company_id! },
        });
        if (!holder) throw new LeaseRequestError("Hyresparten hittades inte", 400);
      } else {
        holder = await tx.leaseHolder.create({
          data: {
            company_id: user.company_id!,
            party_type: input.holderType,
            name: input.holderName,
            contact_name: input.holderContactName,
            email: input.holderEmail,
            phone: input.holderPhone,
            organization_number: input.holderOrganizationNumber,
          },
        });
      }

      const created = await tx.lease.create({
        data: {
          company_id: user.company_id!,
          property_id: unit.property_id,
          unit_id: unit.id,
          lease_holder_id: holder.id,
          created_by_id: user.id,
          lease_number: input.leaseNumber || generateLeaseNumber(),
          status: input.status,
          start_date: input.startDate,
          end_date: input.endDate,
          notice_date: input.noticeDate,
          monthly_rent: input.monthlyRent,
          deposit: input.deposit,
          annual_index_percent: input.annualIndexPercent,
          payment_terms_days: input.paymentTermsDays,
          note: input.note,
          ended_at: input.status === "ended" || input.status === "cancelled" ? new Date() : null,
        },
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
          entity_id: created.id,
          action: "lease.v2.created",
          metadata: {
            leaseNumber: created.lease_number,
            propertyId: created.property_id,
            unitId: created.unit_id,
            leaseHolderId: created.lease_holder_id,
            status: created.status,
            monthlyRent: created.monthly_rent.toString(),
          },
        },
      });
      return created;
    });

    return NextResponse.json({ lease: leaseResponse(lease) }, { status: 201 });
  } catch (error) {
    if (error instanceof LeaseRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Avtalsnumret används redan eller objektet har ett annat pågående avtal" }, { status: 409 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Ogiltigt JSON-underlag" }, { status: 400 });
    console.error("Create lease error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

class LeaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
