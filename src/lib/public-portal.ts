import db from "@/lib/db";

// Public deployment configuration for www.revalta.se. This identifier is already
// public in the portal response and is not a credential. An explicit environment
// variable always wins, which keeps staging and future tenant domains configurable.
export const REVALTA_PORTAL_COMPANY_ID = "6288b3f6-2ea4-480f-af34-d35d95a2e777";

const companySelect = {
  id: true,
  name: true,
  users: {
    where: { status: "active" as const },
    orderBy: { created_at: "asc" as const },
    take: 1,
    select: { id: true, email: true },
  },
};

export function toPortalSlug(name: string, id: string) {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || id.slice(0, 8);
}

export function extractPortalCompanySlug(request: Request, bodySlug?: unknown) {
  const header = request.headers.get("x-portal-company-slug")?.trim();
  if (header) return header;
  const url = new URL(request.url);
  const query = url.searchParams.get("companySlug")?.trim();
  if (query) return query;
  if (typeof bodySlug === "string" && bodySlug.trim()) return bodySlug.trim();
  return null;
}

async function wrapCompany(
  company: { id: string; name: string; users: Array<{ id: string; email: string }> },
  propertyId?: string | null,
) {
  if (!company.users[0]) return null;

  if (propertyId) {
    const property = await db.property.findFirst({
      where: { id: propertyId, company_id: company.id, status: "active", deleted_at: null },
      select: { id: true },
    });
    if (!property) return null;
  }

  return { company, owner: company.users[0] };
}

async function getCompanyById(companyId: string, propertyId?: string | null) {
  const company = await db.company.findFirst({
    where: { id: companyId, status: "active" },
    select: companySelect,
  });
  if (!company) return null;
  return wrapCompany(company, propertyId);
}

export async function getPublicPortalCompanyBySlug(companySlug: string, propertyId?: string | null) {
  const slug = companySlug.trim().toLowerCase();
  if (!slug) return null;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug)) {
    return getCompanyById(slug, propertyId);
  }

  const configuredCompanyId =
    process.env.PUBLIC_PORTAL_COMPANY_ID?.trim() ||
    (process.env.VERCEL === "1" ? REVALTA_PORTAL_COMPANY_ID : undefined);

  if (configuredCompanyId) {
    const configured = await getCompanyById(configuredCompanyId, propertyId);
    if (!configured) return null;
    if (toPortalSlug(configured.company.name, configured.company.id) !== slug) return null;
    return configured;
  }

  const companies = await db.company.findMany({
    where: { status: "active", users: { some: { status: "active" } } },
    orderBy: { created_at: "asc" },
    take: 200,
    select: companySelect,
  });

  const matches = companies.filter((company) => toPortalSlug(company.name, company.id) === slug);
  if (matches.length !== 1) return null;
  return wrapCompany(matches[0], propertyId);
}

export async function resolvePublicPortalCompany(options?: {
  propertyId?: string | null;
  companySlug?: string | null;
}) {
  if (options?.companySlug) {
    return getPublicPortalCompanyBySlug(options.companySlug, options.propertyId);
  }
  return getPublicPortalCompany(options?.propertyId);
}

export async function getPublicPortalCompany(propertyId?: string | null) {
  const configuredCompanyId =
    process.env.PUBLIC_PORTAL_COMPANY_ID?.trim() ||
    (process.env.VERCEL === "1" ? REVALTA_PORTAL_COMPANY_ID : undefined);

  if (configuredCompanyId) {
    return getCompanyById(configuredCompanyId, propertyId);
  }

  if (propertyId) {
    const property = await db.property.findFirst({
      where: { id: propertyId, status: "active", deleted_at: null, company: { status: "active" } },
      select: {
        company: {
          select: companySelect,
        },
      },
    });

    if (property?.company?.users[0]) {
      return { company: property.company, owner: property.company.users[0] };
    }
  }

  const companies = await db.company.findMany({
    where: { status: "active", users: { some: { status: "active" } } },
    orderBy: { created_at: "asc" },
    take: 2,
    select: companySelect,
  });

  if (companies.length === 1 && companies[0].users[0]) {
    return { company: companies[0], owner: companies[0].users[0] };
  }

  // Never guess between tenants. A shared portal may auto-resolve only while the
  // installation has exactly one active company; multi-tenant installations must
  // configure PUBLIC_PORTAL_COMPANY_ID or provide a company slug / property id.
  return null;
}

export function generatePublicReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const year = new Date().getFullYear();
  return `RV-${year}-${random}`;
}
