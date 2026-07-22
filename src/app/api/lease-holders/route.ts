import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";
import { LEASE_HOLDER_TYPES } from "@/lib/leasing";
import { normalizeSwedishOrganizationNumber } from "@/lib/swedish-organization-number";

const partyTypes = new Set<string>(LEASE_HOLDER_TYPES);
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

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const propertyId = new URL(request.url).searchParams.get("propertyId");
    if (propertyId) {
      const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id }, select: { id: true } });
      if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    }

    const holders = await db.leaseHolder.findMany({
      where: {
        company_id: user.company_id,
        ...(propertyId ? { leases: { some: { property_id: propertyId } } } : {}),
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 1_000,
      include: {
        leases: {
          where: propertyId ? { property_id: propertyId } : undefined,
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
        _count: { select: { leases: true } },
      },
    });

    return NextResponse.json({ holders, permissions: { canManage: canManageLeases(user.role) } });
  } catch (error) {
    console.error("Get lease holders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet att hantera kontaktregistret" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const requestedPartyType = text(body?.partyType) === "organization" ? "company" : text(body?.partyType);
    const partyType = partyTypes.has(requestedPartyType) ? requestedPartyType : "individual";
    const name = text(body?.name);
    const contactName = optionalText(body?.contactName);
    const email = optionalText(body?.email)?.toLowerCase() || null;
    const phone = optionalText(body?.phone);
    const organizationNumberInput = optionalText(body?.organizationNumber);
    const organizationNumber = organizationNumberInput ? normalizeSwedishOrganizationNumber(organizationNumberInput) : null;
    const status = statuses.has(text(body?.status)) ? text(body?.status) : "active";

    if (name.length < 2 || name.length > 160) return NextResponse.json({ error: "Namn måste vara mellan 2 och 160 tecken" }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Ange en giltig e-postadress" }, { status: 400 });
    if (organizationNumberInput && !organizationNumber) return NextResponse.json({ error: "Ange ett giltigt svenskt organisationsnummer" }, { status: 400 });
    if (partyType !== "individual" && !organizationNumber) return NextResponse.json({ error: "Organisationsnummer krävs för företag och föreningar" }, { status: 400 });

    const duplicate = await db.leaseHolder.findFirst({
      where: {
        company_id: user.company_id,
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(organizationNumber ? [{ organization_number: organizationNumber }] : []),
        ],
      },
      select: { id: true, name: true },
    });
    if (duplicate) return NextResponse.json({ error: `Kontakten finns redan som ${duplicate.name}` }, { status: 409 });

    const holder = await db.leaseHolder.create({
      data: {
        company_id: user.company_id,
        party_type: partyType,
        name,
        contact_name: contactName,
        email,
        phone,
        organization_number: organizationNumber,
        status,
      },
      include: { leases: true, _count: { select: { leases: true } } },
    });

    await writeAuditLog(user, {
      entityType: "lease_holder",
      entityId: holder.id,
      action: "lease_holder.created",
      metadata: { name: holder.name, partyType: holder.party_type },
    });

    return NextResponse.json({ holder }, { status: 201 });
  } catch (error) {
    console.error("Create lease holder error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
