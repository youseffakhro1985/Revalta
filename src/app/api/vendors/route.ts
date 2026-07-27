import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { auditScopedWhere, canManageTickets, canViewOperations, getCurrentUser } from "@/lib/current-user";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, parseOptionalDate } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const entityType = "vendor_contract";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewOperations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa leverantörsavtal" }, { status: 403 });
    }

    const [rows, legacy] = await Promise.all([
      user.company_id
        ? db.vendorContract.findMany({
            where: {
              company_id: user.company_id,
              OR: [{ property_id: null }, { property: { deleted_at: null } }],
            },
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
const contactFieldKeys = ["contactName", "email", "phone"] as const;
const contractFieldKeys = ["name", "orgNumber", "category", "contractTitle", "contractValue", "startDate", "endDate", "noticeMonths"] as const;

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const vendorId = String(body.vendorId || body.id || "").trim();
    if (!vendorId) return NextResponse.json({ error: "Leverantörs-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const hasContactUpdate = contactFieldKeys.some((key) => body[key] !== undefined);
    const hasContractUpdate = contractFieldKeys.some((key) => body[key] !== undefined);
    const hasFieldUpdate = hasContactUpdate || hasContractUpdate;
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const existing = await db.vendorContract.findFirst({
      where: {
        id: vendorId,
        company_id: user.company_id,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: {
        id: true,
        name: true,
        status: true,
        org_number: true,
        category: true,
        contact_name: true,
        email: true,
        phone: true,
        contract_title: true,
        contract_value: true,
        start_date: true,
        end_date: true,
        notice_months: true,
      },
    });
    if (!existing) {
      const orphaned = await db.vendorContract.findFirst({
        where: { id: vendorId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Leverantören hittades inte" }, { status: 404 });
      }
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
          error: "Leverantören finns kvar i äldre lagring. Kör backfill till VendorContract innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Leverantören hittades inte" }, { status: 404 });
    }

    if (hasContractUpdate && existing.status !== "active") {
      return NextResponse.json({ error: "Avtalsuppgifter kan bara ändras när leverantören är aktiv" }, { status: 400 });
    }

    const nextStatus = hasStatus ? status : existing.status;
    let name = existing.name;
    let orgNumber = existing.org_number || "";
    let category = existing.category;
    let contactName = existing.contact_name || "";
    let email = existing.email || "";
    let phone = existing.phone || "";
    let contractTitle = existing.contract_title || "";
    let contractValue = asNumber(existing.contract_value);
    let startDate = existing.start_date;
    let endDate = existing.end_date;
    let noticeMonths = existing.notice_months;

    if (hasContactUpdate) {
      if (body.contactName !== undefined) contactName = String(body.contactName || "").trim();
      if (body.email !== undefined) email = String(body.email || "").trim();
      if (body.phone !== undefined) phone = String(body.phone || "").trim();
    }

    if (hasContractUpdate) {
      if (body.name !== undefined) name = String(body.name || "").trim();
      if (body.orgNumber !== undefined) orgNumber = String(body.orgNumber || "").trim();
      if (body.category !== undefined) category = String(body.category || "Övrigt").trim() || "Övrigt";
      if (body.contractTitle !== undefined) contractTitle = String(body.contractTitle || "").trim();
      if (body.contractValue !== undefined) contractValue = Number(body.contractValue);
      if (body.noticeMonths !== undefined) noticeMonths = Number(body.noticeMonths);
      if (body.startDate !== undefined) {
        const parsed = body.startDate ? parseOptionalDate(String(body.startDate)) : null;
        if (body.startDate && !parsed) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
        startDate = parsed;
      }
      if (body.endDate !== undefined) {
        const parsed = body.endDate ? parseOptionalDate(String(body.endDate)) : null;
        if (body.endDate && !parsed) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
        endDate = parsed;
      }
      if (!name) return NextResponse.json({ error: "Leverantörsnamn krävs" }, { status: 400 });
      if (!Number.isFinite(contractValue) || contractValue < 0 || !Number.isFinite(noticeMonths) || noticeMonths < 0) {
        return NextResponse.json({ error: "Kontrollera avtalsvärde och uppsägningstid" }, { status: 400 });
      }
    }

    const statusOnly = hasStatus && !hasFieldUpdate;
    if (statusOnly && existing.status === nextStatus) {
      return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
    }

    const data: Record<string, unknown> = { status: nextStatus };
    if (hasContactUpdate) {
      data.contact_name = contactName || null;
      data.email = email || null;
      data.phone = phone || null;
    }
    if (hasContractUpdate) {
      data.name = name;
      data.org_number = orgNumber || null;
      data.category = category;
      data.contract_title = contractTitle || null;
      data.contract_value = contractValue;
      data.start_date = startDate;
      data.end_date = endDate;
      data.notice_months = noticeMonths;
    }

    const updateResult = await db.vendorContract.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Leverantören hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType,
      entityId: existing.id,
      action: statusOnly ? "vendor_contract.status_updated" : "vendor_contract.updated",
      metadata: {
        name,
        previousStatus: existing.status,
        status: nextStatus,
        contactName,
        email,
        phone,
        contractTitle,
        contractValue,
        endDate: endDate?.toISOString().slice(0, 10) || "",
        noticeMonths,
        storage: "VendorContract",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
  } catch (error) {
    console.error("Update vendor error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
