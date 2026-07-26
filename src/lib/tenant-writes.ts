import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof prisma;

type OwnedModelDelegate = {
  updateMany: (args: {
    where: { id: string; company_id: string };
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>;
  deleteMany: (args: {
    where: { id: string; company_id: string };
  }) => Promise<{ count: number }>;
  findFirst: (args: {
    where: { id: string; company_id: string };
  }) => Promise<Record<string, unknown> | null>;
};

function getOwnedDelegate(db: DbClient, model: string): OwnedModelDelegate {
  const delegate = (db as unknown as Record<string, OwnedModelDelegate | undefined>)[model];
  if (!delegate) {
    throw new Error(`Okänd modell för tenant-skrivning: ${model}`);
  }
  return delegate;
}

/**
 * Company-scoped update. Returns null when the row is missing for this tenant.
 * Prefer this over update({ where: { id } }) after a separate ownership check.
 */
export async function updateOwnedByCompany<T extends Record<string, unknown>>(
  model: string,
  args: {
    id: string;
    companyId: string;
    data: Record<string, unknown>;
  },
  db: DbClient = prisma,
): Promise<T | null> {
  const delegate = getOwnedDelegate(db, model);
  const result = await delegate.updateMany({
    where: { id: args.id, company_id: args.companyId },
    data: args.data,
  });
  if (result.count === 0) return null;
  return (await delegate.findFirst({
    where: { id: args.id, company_id: args.companyId },
  })) as T | null;
}

/**
 * Company-scoped delete. Returns false when the row is missing for this tenant.
 */
export async function deleteOwnedByCompany(
  model: string,
  args: {
    id: string;
    companyId: string;
  },
  db: DbClient = prisma,
): Promise<boolean> {
  const delegate = getOwnedDelegate(db, model);
  const result = await delegate.deleteMany({
    where: { id: args.id, company_id: args.companyId },
  });
  return result.count > 0;
}
