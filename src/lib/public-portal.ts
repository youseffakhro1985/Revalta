import db from "@/lib/db";

export async function getPublicPortalCompany() {
  const configuredCompanyId = process.env.PUBLIC_PORTAL_COMPANY_ID;

  if (configuredCompanyId) {
    const company = await db.company.findUnique({
      where: { id: configuredCompanyId },
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

    if (company?.users[0]) return { company, owner: company.users[0] };
  }

  const company = await db.company.findFirst({
    where: { status: "active" },
    orderBy: { created_at: "asc" },
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
  return { company, owner: company.users[0] };
}

export function generatePublicReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const year = new Date().getFullYear();
  return `RV-${year}-${random}`;
}
