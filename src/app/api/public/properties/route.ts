import db from "@/lib/db";
import { getPublicPortalCompany } from "@/lib/public-portal";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const portal = await getPublicPortalCompany();
    if (!portal) {
      return NextResponse.json({ error: "Boendeportalen är inte konfigurerad ännu" }, { status: 503 });
    }

    const properties = await db.property.findMany({
      where: process.env.PUBLIC_PORTAL_COMPANY_ID
        ? { company_id: portal.company.id }
        : { company: { status: "active" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        postal_code: true,
        city: true,
        company: { select: { name: true } },
      },
    });

    return NextResponse.json({
      company: { id: portal.company.id, name: portal.company.name },
      properties,
    });
  } catch (error) {
    console.error("Get public properties error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
