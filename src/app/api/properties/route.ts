import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";

/** Explicit select avoids querying soft-delete columns that may not exist yet. */
const propertyListSelect = (ticketActive: { deleted_at: null } | Record<string, never>) => ({
  id: true,
  name: true,
  address: true,
  postal_code: true,
  city: true,
  property_identifier: true,
  property_type: true,
  status: true,
  created_at: true,
  updated_at: true,
  _count: {
    select: { tickets: { where: ticketActive }, buildings: true, units: true },
  },
} as const);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [propertyActive, ticketActive] = await Promise.all([
      notDeletedFilter("Property"),
      notDeletedFilter("Ticket"),
    ]);
    const properties = await db.property.findMany({
      where: { ...propertyActive, ...tenantWhere(user) },
      orderBy: { created_at: "desc" },
      select: propertyListSelect(ticketActive),
      // Safety cap: the property list is not yet paginated client-side, but must
      // not be truly unbounded for a very large multi-property landlord/company.
      take: 2000,
    });

    return NextResponse.json({
      properties,
      permissions: { canCreate: canCreateProperties(user.role) },
    });
  } catch (error) {
    console.error("Get properties error:", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa fastigheter" }, { status: 403 });
    }

    const { name, address, postalCode, city } = await request.json();
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedAddress = typeof address === "string" ? address.trim() : "";
    const normalizedPostalCode = typeof postalCode === "string" && postalCode.trim() ? postalCode.trim() : null;
    const normalizedCity = typeof city === "string" ? city.trim() : "";

    if (!normalizedName || !normalizedAddress || !normalizedCity) {
      return NextResponse.json({ error: "Namn, adress och ort krävs" }, { status: 400 });
    }
    if (
      normalizedName.length > 160
      || normalizedAddress.length > 240
      || (normalizedPostalCode?.length ?? 0) > 32
      || normalizedCity.length > 120
    ) {
      return NextResponse.json({ error: "En eller flera fastighetsuppgifter är för långa" }, { status: 400 });
    }

    const ticketActive = await notDeletedFilter("Ticket");
    const property = await db.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          name: normalizedName,
          address: normalizedAddress,
          postal_code: normalizedPostalCode,
          city: normalizedCity,
          company_id: user.company_id,
          user_id: user.id,
        },
        select: propertyListSelect(ticketActive),
      });
      await writeAuditLog(user, {
        entityType: "property",
        entityId: created.id,
        action: "property.created",
        metadata: { name: created.name, address: created.address, city: created.city },
      }, tx);
      return created;
    });

    return NextResponse.json({ success: true, property }, { status: 201 });
  } catch (error) {
    console.error("Create property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
