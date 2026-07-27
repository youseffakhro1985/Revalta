import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt, parseDateOnly, loadLegacyRows } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "inspection.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [rows, logs, properties] = await Promise.all([
      user.company_id
        ? db.complianceInspection.findMany({
            where: { company_id: user.company_id, property: { deleted_at: null } },
            orderBy: { created_at: "desc" },
            take: 300,
            include: { property: { select: { name: true } } },
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 300,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      type: row.type,
      title: row.title,
      due_date: row.due_date.toISOString().slice(0, 10),
      responsible: row.responsible || "",
      supplier: row.supplier || "",
      interval_months: row.interval_months,
      status: row.status,
      note: row.note || "",
      work_order_id: row.work_order_id,
      created_at: row.created_at,
      source: "table" as const,
    }));
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = logs
      .filter((log) => !isModernStorageMirror(log.metadata, "ComplianceInspection", modernIds, log.entity_id) && !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({ inspections: mergeByCreatedAt(modern, legacy, 300), properties });
  } catch (error) {
    console.error("Get inspections error:", error);
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
    const type = String(body.type || "").trim();
    const title = String(body.title || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const responsible = String(body.responsible || "").trim();
    const supplier = String(body.supplier || "").trim();
    const intervalMonths = Number(body.intervalMonths || 0);
    const status = String(body.status || "planned").trim();
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["ovk", "sba", "elevator", "energy", "radon", "pressure", "playground", "electrical", "other"]);
    const allowedStatuses = new Set(["planned", "booked", "completed", "action_required"]);
    const parsedDue = parseDateOnly(dueDate);

    if (!propertyId || !title || !parsedDue || !allowedTypes.has(type) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, kontrolltyp, namn och förfallodatum krävs" }, { status: 400 });
    }
    if (!Number.isFinite(intervalMonths) || intervalMonths < 0 || intervalMonths > 240) {
      return NextResponse.json({ error: "Kontrollera intervallet" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const inspection = await db.complianceInspection.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        type,
        title,
        due_date: parsedDue,
        responsible: responsible || null,
        supplier: supplier || null,
        interval_months: intervalMonths,
        status,
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "compliance_inspection",
      entityId: inspection.id,
      action,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        type,
        title,
        due_date: dueDate,
        responsible,
        supplier,
        interval_months: intervalMonths,
        status,
        note,
        storage: "ComplianceInspection",
      },
    });

    return NextResponse.json({ success: true, inspection }, { status: 201 });
  } catch (error) {
    console.error("Create inspection error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
