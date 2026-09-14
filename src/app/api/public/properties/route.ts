import { NextResponse } from "next/server";
import { extractPortalCompanySlug } from "@/lib/public-portal";
import { loadPublicPortalCatalog } from "@/lib/public-portal-properties";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/properties" });

export async function GET(request: Request) {
  try {
    const catalog = await loadPublicPortalCatalog(extractPortalCompanySlug(request));
    if (!catalog.company) {
      return NextResponse.json({ error: catalog.error || "Boendeportalen är inte konfigurerad ännu" }, { status: 503 });
    }

    return NextResponse.json({
      company: catalog.company,
      properties: catalog.properties,
    });
  } catch (error) {
    logger.error("Get public properties error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
