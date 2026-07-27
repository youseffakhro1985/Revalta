import db from "@/lib/db";
import { auditScopedWhere, canManageLeases, canViewLeasingData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, parseDateOnly, loadLegacyRows } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const noticeAction = "rent_notice.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewLeasingData(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa hyresaviseringar" }, { status: 403 });
    }

    const [rows, notices, leases, properties] = await Promise.all([
      user.company_id
        ? db.rentNotice.findMany({
            where: { company_id: user.company_id, property: { deleted_at: null } },
            orderBy: { created_at: "desc" },
            take: 500,
            include: { property: { select: { name: true } } },
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action: noticeAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      user.company_id
        ? db.lease.findMany({
            where: { company_id: user.company_id, deleted_at: null, property: { deleted_at: null } },
            orderBy: { updated_at: "desc" },
            take: 500,
            include: {
              property: { select: { name: true } },
              unit: { select: { designation: true } },
              lease_holder: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      lease_id: row.lease_id,
      tenant_name: row.tenant_name,
      unit: row.unit || "",
      period: row.period,
      due_date: row.due_date.toISOString().slice(0, 10),
      status: row.status,
      base_rent: asNumber(row.base_rent),
      index_percent: asNumber(row.index_percent),
      indexed_rent: asNumber(row.indexed_rent),
      additions: asNumber(row.additions),
      deductions: asNumber(row.deductions),
      total: asNumber(row.total),
      note: row.note || "",
      created_at: row.created_at,
      source: "table" as const,
    }));
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = notices
      .filter((log) => !isModernStorageMirror(log.metadata, "RentNotice", modernIds, log.entity_id) && !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      notices: mergeByCreatedAt(modern, legacy, 500),
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
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

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
    const parsedDue = parseDateOnly(dueDate);
    if (!period || !parsedDue || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, period, förfallodatum och giltig status krävs" }, { status: 400 });
    }
    if ([baseRent, additions, deductions, indexPercent].some((value) => !Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "Kontrollera hyra, tillägg, avdrag och index" }, { status: 400 });
    }

    let resolvedPropertyId = propertyId;
    if (leaseId) {
      const lease = await db.lease.findFirst({
        where: { id: leaseId, company_id: user.company_id, deleted_at: null },
        include: { lease_holder: { select: { name: true } }, unit: { select: { designation: true } } },
      });
      if (!lease) return NextResponse.json({ error: "Kontraktet hittades inte" }, { status: 400 });
      resolvedPropertyId = lease.property_id;
      tenantName = lease.lease_holder.name;
      unit = lease.unit.designation;
      if (body.baseRent === "" || body.baseRent === undefined || body.baseRent === null) baseRent = Number(lease.monthly_rent);
    }

    if (!resolvedPropertyId) return NextResponse.json({ error: "Fastighet krävs" }, { status: 400 });
    const property = await db.property.findFirst({ where: { id: resolvedPropertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const indexedRent = baseRent * (1 + indexPercent / 100);
    const total = Math.max(0, indexedRent + additions - deductions);

    const notice = await db.rentNotice.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        lease_id: leaseId || null,
        tenant_name: tenantName,
        unit: unit || null,
        period,
        due_date: parsedDue,
        status,
        base_rent: baseRent,
        index_percent: indexPercent,
        indexed_rent: indexedRent,
        additions,
        deductions,
        total,
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "rent_notice",
      entityId: notice.id,
      action: noticeAction,
      metadata: {
        property_id: property.id,
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
        storage: "RentNotice",
      },
    });

    return NextResponse.json({ success: true, notice }, { status: 201 });
  } catch (error) {
    console.error("Create rent notice error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

const patchAllowedStatuses = new Set(["draft", "sent", "paid", "overdue", "credited"]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const noticeId = String(body.noticeId || body.id || "").trim();
    if (!noticeId) return NextResponse.json({ error: "Avi-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    if (hasStatus && !patchAllowedStatuses.has(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const fieldKeys = ["baseRent", "additions", "deductions", "indexPercent", "period", "dueDate", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);

    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const existing = await db.rentNotice.findFirst({
      where: { id: noticeId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        tenant_name: true,
        period: true,
        status: true,
        due_date: true,
        base_rent: true,
        index_percent: true,
        additions: true,
        deductions: true,
        note: true,
        total: true,
      },
    });
    if (!existing) {
      const orphaned = await db.rentNotice.findFirst({
        where: { id: noticeId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Hyresavin hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: noticeAction, id: noticeId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Hyresavin finns kvar i äldre lagring. Kör backfill till RentNotice innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Hyresavin hittades inte" }, { status: 404 });
    }

    if (hasFieldUpdate && existing.status !== "draft") {
      return NextResponse.json({ error: "Belopp och period kan bara ändras när avin är utkast" }, { status: 400 });
    }

    const nextStatus = hasStatus ? status : existing.status;
    let baseRent = asNumber(existing.base_rent);
    let additions = asNumber(existing.additions);
    let deductions = asNumber(existing.deductions);
    let indexPercent = asNumber(existing.index_percent);
    let period = existing.period;
    let dueDate = existing.due_date;
    let note = existing.note || "";

    if (hasFieldUpdate) {
      if (body.baseRent !== undefined) baseRent = Number(body.baseRent);
      if (body.additions !== undefined) additions = Number(body.additions);
      if (body.deductions !== undefined) deductions = Number(body.deductions);
      if (body.indexPercent !== undefined) indexPercent = Number(body.indexPercent);
      if (body.period !== undefined) period = String(body.period || "").trim();
      if (body.dueDate !== undefined) {
        const parsedDue = parseDateOnly(String(body.dueDate || "").trim());
        if (!parsedDue) return NextResponse.json({ error: "Ogiltigt förfallodatum" }, { status: 400 });
        dueDate = parsedDue;
      }
      if (body.note !== undefined) note = String(body.note || "").trim();
      if (!period) return NextResponse.json({ error: "Period krävs" }, { status: 400 });
      if ([baseRent, additions, deductions, indexPercent].some((value) => !Number.isFinite(value) || value < 0)) {
        return NextResponse.json({ error: "Kontrollera hyra, tillägg, avdrag och index" }, { status: 400 });
      }
    }

    const indexedRent = baseRent * (1 + indexPercent / 100);
    const total = Math.max(0, indexedRent + additions - deductions);
    const statusOnly = hasStatus && !hasFieldUpdate;
    if (statusOnly && existing.status === nextStatus) {
      return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
    }

    const data = hasFieldUpdate
      ? {
          status: nextStatus,
          base_rent: baseRent,
          index_percent: indexPercent,
          indexed_rent: indexedRent,
          additions,
          deductions,
          total,
          period,
          due_date: dueDate,
          note: note || null,
        }
      : { status: nextStatus };

    const updateResult = await db.rentNotice.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Hyresavin hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "rent_notice",
      entityId: existing.id,
      action: statusOnly ? "rent_notice.status_updated" : "rent_notice.updated",
      metadata: {
        tenant_name: existing.tenant_name,
        period,
        previousStatus: existing.status,
        status: nextStatus,
        base_rent: baseRent,
        index_percent: indexPercent,
        indexed_rent: indexedRent,
        additions,
        deductions,
        total,
        due_date: dueDate.toISOString().slice(0, 10),
        note,
        storage: "RentNotice",
      },
    });

    return NextResponse.json({
      success: true,
      id: existing.id,
      status: nextStatus,
      total,
      indexed_rent: indexedRent,
    });
  } catch (error) {
    console.error("Update rent notice error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
