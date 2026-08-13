import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, canViewLeasingData, getCurrentUser } from "@/lib/current-user";
import { generateLeaseNumber, isOccupyingLeaseStatus, parseLeaseInput } from "@/lib/leasing";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/leases" });

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

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!canViewLeasingData(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa uthyrningsdata" }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
    const requestedPageSize = Number.parseInt(searchParams.get("pageSize") || "50", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isFinite(requestedPageSize) ? Math.min(100, Math.max(10, requestedPageSize)) : 50;
    const where = { company_id: user.company_id, deleted_at: null, property: { deleted_at: null } };
    const leaseInclude = {
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true, unit_type: true, floor: true, area: true, status: true } },
      lease_holder: true,
      created_by: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.LeaseInclude;

    const [leases, occupyingLeases, total, rentTotals, activeHolderGroups, properties, holders] = await Promise.all([
      db.lease.findMany({
        where,
        orderBy: [{ status: "asc" }, { updated_at: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: leaseInclude,
      }),
      db.lease.findMany({
        where: { ...where, status: { in: ["reserved", "active", "notice"] } },
        orderBy: [{ updated_at: "desc" }, { id: "asc" }],
        include: leaseInclude,
        // Safety cap: this list drives the occupancy view (not the paginated table
        // above) and is naturally bounded by unit count, but must not be truly
        // unbounded for a very large portfolio.
        take: 5000,
      }),
      db.lease.count({ where }),
      db.lease.aggregate({
        where: { ...where, status: { in: ["active", "notice"] } },
        _sum: { monthly_rent: true },
      }),
      db.lease.groupBy({
        by: ["lease_holder_id"],
        where: { ...where, status: { in: ["active", "notice"] } },
      }),
      db.property.findMany({
        where: { company_id: user.company_id, status: { not: "sold" }, deleted_at: null },
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
        where: { deleted_at: null, company_id: user.company_id, status: "active" },
        orderBy: { name: "asc" },
        take: 1_000,
      }),
    ]);

    return NextResponse.json({
      leases: leases.map(leaseResponse),
      occupyingLeases: occupyingLeases.map(leaseResponse),
      properties,
      holders,
      permissions: { canManage: canManageLeases(user.role) },
      summary: {
        activeHolders: activeHolderGroups.length,
        annualRent: Number(rentTotals._sum.monthly_rent ?? 0) * 12,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    logger.error("Get leases error", error);
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
        where: { id: input.unitId, status: "active", property: { company_id: user.company_id!, deleted_at: null } },
        include: { property: { select: { id: true, name: true, address: true, city: true } } },
      });
      if (!unit || !leasableUnitTypes.includes(unit.unit_type)) throw new LeaseRequestError("Objektet hittades inte", 404);

      if (isOccupyingLeaseStatus(input.status)) {
        const conflict = await tx.lease.findFirst({
          where: { deleted_at: null, unit_id: unit.id, company_id: user.company_id!, status: { in: ["reserved", "active", "notice"] } },
          select: { lease_number: true },
        });
        if (conflict) throw new LeaseRequestError(`Objektet har redan ett pågående avtal (${conflict.lease_number})`, 409);
      }

      let holder;
      if (input.holderId) {
        const existingHolder = await tx.leaseHolder.findFirst({ where: { deleted_at: null, id: input.holderId, company_id: user.company_id! } });
        if (!existingHolder) throw new LeaseRequestError("Hyresparten hittades inte", 400);
        const holderUpdate = await tx.leaseHolder.updateMany({
          where: { deleted_at: null, id: existingHolder.id, company_id: user.company_id! },
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
          where: { deleted_at: null, id: existingHolder.id, company_id: user.company_id! },
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
    logger.error("Create lease error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

class LeaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
