import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const properties = await db.property.findMany({
      where: tenantWhere(user),
      orderBy: { created_at: "desc" },
      include: {
        _count: {
          select: { tickets: true, buildings: true, units: true },
        },
      },
    });

    return NextResponse.json({ properties });
  } catch (error) {
    console.error("Get properties error:", error);
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

    const property = await db.property.create({
      data: {
        name: normalizedName,
        address: normalizedAddress,
        postal_code: normalizedPostalCode,
        city: normalizedCity,
        company_id: user.company_id,
        user_id: user.id,
      },
      include: {
        _count: {
          select: { tickets: true, buildings: true, units: true },
        },
      },
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action: "property.created",
      metadata: { name: property.name, address: property.address, city: property.city },
    });

    return NextResponse.json({ success: true, property }, { status: 201 });
  } catch (error) {
    console.error("Create property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}