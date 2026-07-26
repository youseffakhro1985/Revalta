import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, parseOptionalDate } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const entityType = "vendor_contract";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [rows, legacy] = await Promise.all([
      user.company_id
        ? db.vendorContract.findMany({
            where: { company_id: user.company_id },
            orderBy: { created_at: "desc" },
            take: 200,
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), entity_type: entityType },
        orderBy: { created_at: "desc" },
        take: 200,
        select: { id: true, created_at: true, metadata: true, entity_id: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      name: row.name,
      orgNumber: row.org_number || "",
      category: row.category,
      contactName: row.contact_name || "",
      email: row.email || "",
      phone: row.phone || "",
      contractTitle: row.contract_title || "",
      contractValue: asNumber(row.contract_value),
      startDate: row.start_date?.toISOString().slice(0, 10) || "",
      endDate: row.end_date?.toISOString().slice(0, 10) || "",
      noticeMonths: row.notice_months,
      propertyId: row.property_id || "",
      status: row.status,
      source: "table" as const,
    }));

    const modernIds = new Set(modern.map((row) => row.id));
    const legacyRows = legacy
      .filter((row) => !isModernStorageMirror(row.metadata, "VendorContract", modernIds, row.entity_id) && !modernIds.has(row.id))
      .map((row) => ({
        id: row.entity_id || row.id,
        created_at: row.created_at,
        ...(row.metadata as Record<string, unknown>),
        source: "legacy" as const,
      }));

    return NextResponse.json({ vendors: mergeByCreatedAt(modern, legacyRows, 200) });
  } catch (error) {
    console.error("Get vendors error:", error);
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
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Leverantörsnamn krävs" }, { status: 400 });

    const contractValue = Number(body.contractValue || 0);
    const noticeMonths = Number(body.noticeMonths || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0 || !Number.isFinite(noticeMonths) || noticeMonths < 0) {
      return NextResponse.json({ error: "Kontrollera avtalsvärde och uppsägningstid" }, { status: 400 });
    }

    const propertyId = body.propertyId ? String(body.propertyId).trim() : "";
    if (propertyId) {
      const property = await db.property.findFirst({
        where: { id: propertyId, company_id: user.company_id, deleted_at: null },
        select: { id: true },
      });
      if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    const startDate = body.startDate ? parseOptionalDate(String(body.startDate)) : null;
    const endDate = body.endDate ? parseOptionalDate(String(body.endDate)) : null;
    if (body.startDate && !startDate) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
    if (body.endDate && !endDate) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });

    const vendor = await db.vendorContract.create({
      data: {
        company_id: user.company_id,
        property_id: propertyId || null,
        name,
        org_number: String(body.orgNumber || "").trim() || null,
        category: String(body.category || "Övrigt"),
        contact_name: String(body.contactName || "").trim() || null,
        email: String(body.email || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        contract_title: String(body.contractTitle || "").trim() || null,
        contract_value: contractValue,
        start_date: startDate,
        end_date: endDate,
        notice_months: noticeMonths,
        status: "active",
        created_by_id: user.id,
      },
    });

    const metadata = {
      name: vendor.name,
      orgNumber: vendor.org_number || "",
      category: vendor.category,
      contactName: vendor.contact_name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      contractTitle: vendor.contract_title || "",
      contractValue,
      startDate: vendor.start_date?.toISOString().slice(0, 10) || "",
      endDate: vendor.end_date?.toISOString().slice(0, 10) || "",
      noticeMonths,
      propertyId: vendor.property_id || "",
      status: vendor.status,
      storage: "VendorContract",
    };

    await writeAuditLog(user, {
      entityType,
      entityId: vendor.id,
      action: "vendor_contract.created",
      metadata,
    });

    return NextResponse.json({ vendor: { id: vendor.id, ...metadata } }, { status: 201 });
  } catch (error) {
    console.error("Create vendor error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

const allowedStatuses = new Set(["active", "ended", "cancelled"]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const vendorId = String(body.vendorId || body.id || "").trim();
    const status = String(body.status || "").trim();
    if (!vendorId || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Leverantörs-id och giltig status krävs" }, { status: 400 });
    }

    const existing = await db.vendorContract.findFirst({
      where: { id: vendorId, company_id: user.company_id },
      select: { id: true, name: true, status: true },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: {
          ...auditScopedWhere(user),
          entity_type: entityType,
          OR: [{ id: vendorId }, { entity_id: vendorId }],
        },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "VendorContract") {
        return NextResponse.json({
          error: "Leverantören finns kvar i äldre lagring. Kör backfill till VendorContract innan status ändras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Leverantören hittades inte" }, { status: 404 });
    }

    if (existing.status === status) return NextResponse.json({ success: true, id: existing.id, status });

    const updateResult = await db.vendorContract.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data: { status },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Leverantören hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType,
      entityId: existing.id,
      action: "vendor_contract.status_updated",
      metadata: {
        name: existing.name,
        previousStatus: existing.status,
        status,
        storage: "VendorContract",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, status });
  } catch (error) {
    console.error("Update vendor status error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
