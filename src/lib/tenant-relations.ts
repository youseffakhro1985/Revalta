/**
 * Related-object tenant helpers.
 *
 * Direct `company_id` on the parent row is not sufficient. Any client-supplied
 * related id (property, ticket, lease, document, vendor, unit, component, …)
 * must be re-read inside the caller's company before it is trusted.
 */

export function companyOwnedWhere(companyId: string, id: string) {
  return { id, company_id: companyId };
}

export async function findCompanyOwned<T>(
  findFirst: (args: { where: { id: string; company_id: string } }) => Promise<T | null>,
  args: { id: string; companyId: string },
): Promise<T | null> {
  const id = args.id.trim();
  const companyId = args.companyId.trim();
  if (!id || !companyId) return null;
  return findFirst({ where: companyOwnedWhere(companyId, id) });
}

/** Tenant-safe miss: do not confirm that a foreign-tenant row exists. */
export const TENANT_SAFE_MISS_STATUS = 404 as const;

export function tenantSafeMissResponse(): { status: typeof TENANT_SAFE_MISS_STATUS; error: string } {
  return { status: 404, error: "Posten hittades inte" };
}

export function relatedIdsMatchCompany<T extends { company_id: string | null }>(
  companyId: string,
  records: Array<T | null | undefined>,
) {
  return records.every((record) => Boolean(record && record.company_id === companyId));
}
