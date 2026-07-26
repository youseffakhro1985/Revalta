/** Prisma where-clause fragment for rows that are not soft-deleted. */
export const notDeleted = { deleted_at: null } as const;

export function withNotDeleted<T extends Record<string, unknown>>(where: T) {
  return { ...where, ...notDeleted };
}
