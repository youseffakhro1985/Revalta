import { randomBytes } from "node:crypto";
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

export function getConfiguredPortalCompanyId() {
  const configured = process.env.PUBLIC_PORTAL_COMPANY_ID?.trim();
  if (configured) return configured;
  if (process.env.VERCEL === "1") return REVALTA_PORTAL_COMPANY_ID;
  return null;
}

const PORTAL_COMPANY_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPublicPortalCompanyBySlug(companySlug: string, propertyId?: string | null) {
  const slug = companySlug.trim().toLowerCase();
  if (!slug) return null;

  const configuredCompanyId = getConfiguredPortalCompanyId();
  if (!configuredCompanyId) return null;

  if (PORTAL_COMPANY_UUID.test(slug)) {
    if (slug !== configuredCompanyId.toLowerCase()) return null;
    return getCompanyById(configuredCompanyId, propertyId);
  }

  const configured = await getCompanyById(configuredCompanyId, propertyId);
  if (!configured) return null;
  if (toPortalSlug(configured.company.name, configured.company.id) !== slug) return null;
  return configured;
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
  const configuredCompanyId = getConfiguredPortalCompanyId();
  if (!configuredCompanyId) return null;
  return getCompanyById(configuredCompanyId, propertyId);
}

export function generatePublicReference() {
  const random = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `RV-${year}-${random}`;
}
