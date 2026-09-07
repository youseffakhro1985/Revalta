import type { Prisma } from "@prisma/client";

/** All booking writers share these locks, including resident self-service. */
export async function lockBookingResources(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  companyId: string,
  propertyId: string,
  resources: string[],
) {
  const keys = [...new Set(resources.map((resource) =>
    `resident-booking:${companyId}:${propertyId}:${resource.trim().toLocaleLowerCase("sv-SE")}`,
  ))].sort();
  // Moving bookings locks both resources in stable order to avoid deadlocks.
  for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
