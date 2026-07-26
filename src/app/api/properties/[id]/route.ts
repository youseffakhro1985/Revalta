import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { OCCUPYING_LEASE_STATUSES } from "@/lib/leasing";

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att redigera fastigheter" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user) },
    });
    if (!existing) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const body = await request.json();
    const name = optionalText(body.name);
    const address = optionalText(body.address);
    const city = optionalText(body.city);

    if (!name || !address || !city) {
      return NextResponse.json({ error: "Namn, adress och ort krävs" }, { status: 400 });
    }

    const constructionYear = optionalNumber(body.constructionYear);
    const totalArea = optionalNumber(body.totalArea);
    const boa = optionalNumber(body.boa);
    const loa = optionalNumber(body.loa);

    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return NextResponse.json({ error: "Ange ett giltigt byggår" }, { status: 400 });
    }

    const updateResult = await db.property.updateMany({
      where: { id, company_id: user.company_id, deleted_at: null },
      data: {
        name,
        address,
        postal_code: optionalText(body.postalCode),
        city,
        property_identifier: optionalText(body.propertyIdentifier),
        property_type: optionalText(body.propertyType) || "residential",
        status: optionalText(body.status) || "active",
        construction_year: constructionYear,
        total_area: totalArea,
        boa,
        loa,
        manager_name: optionalText(body.managerName),
        contact_name: optionalText(body.contactName),
        contact_email: optionalText(body.contactEmail),
        contact_phone: optionalText(body.contactPhone),
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    const property = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
    });
    if (!property) {
      return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: id,
      action: "property.updated",
      metadata: { name: property.name, propertyIdentifier: property.property_identifier },
    });

    return NextResponse.json({ success: true, property });
  } catch (error) {
    console.error("Update property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ta bort fastigheter" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: { id: true, name: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const [openLeases, openTickets, openWorkOrders] = await Promise.all([
      db.lease.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { in: [...OCCUPYING_LEASE_STATUSES] },
        },
      }),
      db.ticket.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { not: "closed" },
        },
      }),
      db.workOrder.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { notIn: ["closed", "cancelled", "completed", "invoiced"] },
        },
      }),
    ]);

    if (openLeases > 0) {
      return NextResponse.json(
        { error: "Fastigheten kan inte tas bort medan det finns aktiva eller pågående hyresavtal" },
        { status: 409 },
      );
    }
    if (openTickets > 0) {
      return NextResponse.json(
        { error: "Fastigheten kan inte tas bort medan det finns öppna ärenden" },
        { status: 409 },
      );
    }
    if (openWorkOrders > 0) {
      return NextResponse.json(
        { error: "Fastigheten kan inte tas bort medan det finns öppna arbetsordrar" },
        { status: 409 },
      );
    }

    const deleteResult = await db.property.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: existing.id,
      action: "property.deleted",
      metadata: { name: existing.name, previousStatus: existing.status, softDelete: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
