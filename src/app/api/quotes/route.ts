import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "quote.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action },
        orderBy: { created_at: "desc" },
        take: 300,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    return NextResponse.json({
      quotes: logs.map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
      })),
      properties,
    });
  } catch (error) {
    console.error("Get quotes error:", error);
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
    const title = String(body.title || "").trim();
    const supplier = String(body.supplier || "").trim();
    const status = String(body.status || "draft").trim();
    const validUntil = String(body.validUntil || "").trim();
    const note = String(body.note || "").trim();
    const labor = Number(body.labor || 0);
    const material = Number(body.material || 0);
    const supplierCost = Number(body.supplierCost || 0);
    const other = Number(body.other || 0);
    const vatRate = Number(body.vatRate ?? 25);

    const allowedStatuses = new Set(["draft", "sent", "approved", "rejected", "invoiced"]);
    if (!propertyId || !title || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, offertnamn och giltig status krävs" }, { status: 400 });
    }

    const amounts = [labor, material, supplierCost, other, vatRate];
    if (amounts.some((value) => !Number.isFinite(value) || value < 0) || vatRate > 100) {
      return NextResponse.json({ error: "Kontrollera belopp och momssats" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const subtotal = labor + material + supplierCost + other;
    const vat = subtotal * (vatRate / 100);
    const total = subtotal + vat;

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        title,
        supplier,
        status,
        valid_until: validUntil || null,
        labor,
        material,
        supplier_cost: supplierCost,
        other,
        subtotal,
        vat_rate: vatRate,
        vat,
        total,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create quote error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
