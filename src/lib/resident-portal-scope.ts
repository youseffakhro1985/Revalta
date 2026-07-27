import { normalizeEmail } from "@/lib/security";

/** Prisma filter fragment matching a lease holder email to the signed-in user. */
export function leaseHolderEmailMatch(userEmail: string) {
  const email = normalizeEmail(userEmail);
  return {
    deleted_at: null,
    email: { equals: email, mode: "insensitive" as const },
  };
}

export function reporterEmailMatch(userEmail: string) {
  const email = normalizeEmail(userEmail);
  return {
    equals: email,
    mode: "insensitive" as const,
  };
}
