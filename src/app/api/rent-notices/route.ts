import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const noticeAction = "rent_notice.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [notices, leases, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action: noticeAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      user.company_id ? db.lease.findMany({
        where: { company_id: user.company_id },
        orderBy: { updated_at: "desc" },
        take: 500,
        include: {
          property: { select: { name: true } },
          unit: { select: { designation: true } },
          lease_holder: { select: { name: true } },
        },
      }) : Promise.resolve([]),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    return NextResponse.json({
      notices: notices.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      leases: leases.map((lease) => ({
        id: lease.id,
        property_id: lease.property_id,
        property_name: lease.property.name,
        tenant_name: lease.lease_holder.name,
        unit: lease.unit.designation,
        monthly_rent: Number(lease.monthly_rent),
        status: lease.status,
      })),
      properties,
    });
  } catch (error) {
    console.error("Get rent notices error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const leaseId = String(body.leaseId || "").trim();
    let tenantName = String(body.tenantName || "").trim();
    let unit = String(body.unit || "").trim();
    const period = String(body.period || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const status = String(body.status || "draft").trim();
    let baseRent = Number(body.baseRent || 0);
    const additions = Number(body.additions || 0);
    const deductions = Number(body.deductions || 0);
    const indexPercent = Number(body.indexPercent || 0);
    const note = String(body.note || "").trim();

    const allowedStatuses = new Set(["draft", "sent", "paid", "overdue", "credited"]);
    if (!period || !dueDate || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, period, förfallodatum och giltig status krävs" }, { status: 400 });
    }
    if ([baseRent, additions, deductions, indexPercent].some((value) => !Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "Kontrollera hyra, tillägg, avdrag och index" }, { status: 400 });
    }

    let resolvedPropertyId = propertyId;
    if (leaseId) {
      if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
      const lease = await db.lease.findFirst({
        where: { id: leaseId, company_id: user.company_id },
        include: { lease_holder: { select: { name: true } }, unit: { select: { designation: true } } },
      });
      if (!lease) return NextResponse.json({ error: "Kontraktet hittades inte" }, { status: 400 });
      resolvedPropertyId = lease.property_id;
      tenantName = lease.lease_holder.name;
      unit = lease.unit.designation;
      if (body.baseRent === "" || body.baseRent === undefined || body.baseRent === null) baseRent = Number(lease.monthly_rent);
    }

    if (!resolvedPropertyId) return NextResponse.json({ error: "Fastighet krävs" }, { status: 400 });
    const property = await db.property.findFirst({ where: { id: resolvedPropertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const indexedRent = baseRent * (1 + indexPercent / 100);
    const total = Math.max(0, indexedRent + additions - deductions);

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action: noticeAction,
      metadata: {
        property_name: property.name,
        lease_id: leaseId || null,
        tenant_name: tenantName,
        unit,
        period,
        due_date: dueDate,
        status,
        base_rent: baseRent,
        index_percent: indexPercent,
        indexed_rent: indexedRent,
        additions,
        deductions,
        total,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create rent notice error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
