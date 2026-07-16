import db from "@/lib/db";

// Public deployment configuration for www.revalta.se. This identifier is already
// public in the portal response and is not a credential. An explicit environment
// variable always wins, which keeps staging and future tenant domains configurable.
export const REVALTA_PORTAL_COMPANY_ID = "6288b3f6-2ea4-480f-af34-d35d95a2e777";

export async function getPublicPortalCompany(propertyId?: string | null) {
  const configuredCompanyId =
    process.env.PUBLIC_PORTAL_COMPANY_ID?.trim() ||
    (process.env.VERCEL === "1" ? REVALTA_PORTAL_COMPANY_ID : undefined);

  if (configuredCompanyId) {
    const company = await db.company.findFirst({
      where: { id: configuredCompanyId, status: "active" },
      select: {
        id: true,
        name: true,
        users: {
          where: { status: "active" },
          orderBy: { created_at: "asc" },
          take: 1,
          select: { id: true, email: true },
        },
      },
    });

    if (!company?.users[0]) return null;

    if (propertyId) {
      const property = await db.property.findFirst({
        where: { id: propertyId, company_id: company.id, status: "active" },
        select: { id: true },
      });
      if (!property) return null;
    }

    return { company, owner: company.users[0] };
  }

  if (propertyId) {
    const property = await db.property.findFirst({
      where: { id: propertyId, status: "active", company: { status: "active" } },
      select: {
        company: {
          select: {
            id: true,
            name: true,
            users: {
              where: { status: "active" },
              orderBy: { created_at: "asc" },
              take: 1,
              select: { id: true, email: true },
            },
          },
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
    select: {
      id: true,
      name: true,
      users: {
        where: { status: "active" },
        orderBy: { created_at: "asc" },
        take: 1,
        select: { id: true, email: true },
      },
    },
  });

  if (companies.length === 1 && companies[0].users[0]) {
    return { company: companies[0], owner: companies[0].users[0] };
  }

  // Never guess between tenants. A shared portal may auto-resolve only while the
  // installation has exactly one active company; multi-tenant installations must
  // configure PUBLIC_PORTAL_COMPANY_ID or provide an opaque property id.
  return null;
}

export function generatePublicReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const year = new Date().getFullYear();
  return `RV-${year}-${random}`;
}
