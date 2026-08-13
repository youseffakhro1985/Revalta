import db from "@/lib/db";
import { extractPortalCompanySlug, resolvePublicPortalCompany, toPortalSlug } from "@/lib/public-portal";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/properties" });

export async function GET(request: Request) {
  try {
    const companySlug = extractPortalCompanySlug(request);
    const portal = await resolvePublicPortalCompany({ companySlug });
    if (!portal) {
      return NextResponse.json({ error: "Boendeportalen är inte konfigurerad ännu" }, { status: 503 });
    }

    const properties = await db.property.findMany({
      where: { company_id: portal.company.id, status: "active", deleted_at: null },
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
      company: {
        id: portal.company.id,
        name: portal.company.name,
        slug: toPortalSlug(portal.company.name, portal.company.id),
      },
      properties,
    });
  } catch (error) {
    logger.error("Get public properties error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
