import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/lease-holders/[holderId]" });

const partyTypes = new Set(["individual", "organization"]);
const statuses = new Set(["active", "inactive"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function validEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ holderId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att redigera kontaktregistret" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { holderId } = await params;
    const existing = await db.leaseHolder.findFirst({ where: { deleted_at: null, id: holderId, company_id: user.company_id } });
    if (!existing) return NextResponse.json({ error: "Kontakten hittades inte" }, { status: 404 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const partyType = partyTypes.has(text(body?.partyType)) ? text(body?.partyType) : existing.party_type;
    const name = text(body?.name);
    const contactName = optionalText(body?.contactName);
    const email = optionalText(body?.email)?.toLowerCase() || null;
    const phone = optionalText(body?.phone);
    const organizationNumber = optionalText(body?.organizationNumber);
    const status = statuses.has(text(body?.status)) ? text(body?.status) : existing.status;

    if (name.length < 2 || name.length > 160) return NextResponse.json({ error: "Namn måste vara mellan 2 och 160 tecken" }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Ange en giltig e-postadress" }, { status: 400 });
    if (partyType === "organization" && !organizationNumber) return NextResponse.json({ error: "Organisationsnummer krävs för organisationer" }, { status: 400 });

    const duplicate = await db.leaseHolder.findFirst({
      where: {
        deleted_at: null,
        company_id: user.company_id,
        id: { not: holderId },
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(organizationNumber ? [{ organization_number: organizationNumber }] : []),
        ],
      },
      select: { id: true, name: true },
    });
    if (duplicate) return NextResponse.json({ error: `Kontakten finns redan som ${duplicate.name}` }, { status: 409 });

    const updateResult = await db.leaseHolder.updateMany({
      where: { deleted_at: null, id: holderId, company_id: user.company_id },
      data: {
        party_type: partyType,
        name,
        contact_name: contactName,
        email,
        phone,
        organization_number: organizationNumber,
        status,
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Kontakten hittades inte" }, { status: 404 });
    }

    const holder = await db.leaseHolder.findFirst({
      where: { deleted_at: null, id: holderId, company_id: user.company_id },
      include: {
        leases: {
          where: { deleted_at: null },
          orderBy: { updated_at: "desc" },
          take: 20,
          select: {
            id: true,
            lease_number: true,
            status: true,
            start_date: true,
            end_date: true,
            property: { select: { id: true, name: true } },
            unit: { select: { id: true, designation: true, unit_type: true } },
          },
        },
        _count: { select: { leases: { where: { deleted_at: null } } } },
      },
    });
    if (!holder) {
      return NextResponse.json({ error: "Kontakten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "lease_holder",
      entityId: holder.id,
      action: "lease_holder.updated",
      metadata: { name: holder.name, partyType: holder.party_type, status: holder.status },
    });

    return NextResponse.json({ holder });
  } catch (error) {
    logger.error("Update lease holder error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ holderId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att ta bort kontakter" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { holderId } = await params;
    const holder = await db.leaseHolder.findFirst({
      where: { id: holderId, company_id: user.company_id, deleted_at: null },
      include: { _count: { select: { leases: { where: { deleted_at: null } } } } },
    });
    if (!holder) return NextResponse.json({ error: "Kontakten hittades inte" }, { status: 404 });
    if (holder._count.leases > 0) return NextResponse.json({ error: "Kontakten kan inte tas bort eftersom den är kopplad till avtal. Sätt status till inaktiv i stället." }, { status: 409 });

    const deleteResult = await db.leaseHolder.updateMany({
      where: { id: holderId, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date(), status: "inactive" },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Kontakten hittades inte" }, { status: 404 });
    }
    await writeAuditLog(user, {
      entityType: "lease_holder",
      entityId: holderId,
      action: "lease_holder.deleted",
      metadata: { name: holder.name, partyType: holder.party_type, softDelete: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete lease holder error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
