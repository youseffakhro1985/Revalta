import db from "@/lib/db";
import { resolvePublicPortalCompany, toPortalSlug } from "@/lib/public-portal";

export type PublicPortalProperty = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  company?: { name: string };
};

export type PublicPortalCatalog = {
  properties: PublicPortalProperty[];
  companyName: string;
  company: { id: string; name: string; slug: string } | null;
  error: string;
};

export async function loadPublicPortalCatalog(companySlug?: string | null): Promise<PublicPortalCatalog> {
  const portal = await resolvePublicPortalCompany({ companySlug: companySlug || null });
  if (!portal) {
    return {
      properties: [],
      companyName: "Revalta",
      company: null,
      error: "Boendeportalen är inte konfigurerad ännu",
    };
  }

  const properties = (await db.property.findMany({
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
  })).map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    postal_code: row.postal_code,
    city: row.city,
    ...(row.company ? { company: { name: row.company.name } } : {}),
  }));

  return {
    properties,
    companyName: portal.company.name,
    company: {
      id: portal.company.id,
      name: portal.company.name,
      slug: toPortalSlug(portal.company.name, portal.company.id),
    },
    error: "",
  };
}

export async function loadPublicPortalCatalogSafe(companySlug?: string | null): Promise<PublicPortalCatalog> {
  try {
    return await loadPublicPortalCatalog(companySlug);
  } catch {
    return {
      properties: [],
      companyName: "Revalta",
      company: null,
      error: "Boendeportalen är inte tillgänglig just nu.",
    };
  }
}
