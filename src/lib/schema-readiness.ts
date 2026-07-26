import { Prisma } from "@prisma/client";
import db from "@/lib/db";

/** Columns required by the production-hardening soft-delete cutover. */
export const REQUIRED_SOFT_DELETE_COLUMNS = [
  { table: "Ticket", column: "deleted_at" },
  { table: "Property", column: "deleted_at" },
  { table: "WorkOrder", column: "deleted_at" },
  { table: "Project", column: "deleted_at" },
  { table: "Lease", column: "deleted_at" },
  { table: "AppNotification", column: "deleted_at" },
] as const;

export type SchemaColumnRequirement = (typeof REQUIRED_SOFT_DELETE_COLUMNS)[number];

export type SchemaReadiness = {
  ready: boolean;
  missing: Array<{ table: string; column: string }>;
  checkedAt: string;
};

type ColumnRow = {
  table_name: string;
  column_name: string;
};

export function isMissingSchemaColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2022") return true;
  // Raw SQL / driver errors when a column is absent.
  const message = typeof error.message === "string" ? error.message : "";
  return /column .* does not exist/i.test(message) || /does not exist in the current database/i.test(message);
}

export function schemaMismatchUserMessage() {
  return "Databasen saknar obligatoriska kolumner för den här versionen. Kör Database Release (prisma migrate deploy) för samma commit innan du testar inloggning på preview/produktion.";
}

export async function getSchemaReadiness(
  requirements: readonly SchemaColumnRequirement[] = REQUIRED_SOFT_DELETE_COLUMNS,
): Promise<SchemaReadiness> {
  const tables = [...new Set(requirements.map((item) => item.table))];
  const rows = await db.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(tables)})
      AND column_name IN (${Prisma.join(requirements.map((item) => item.column))})
  `;

  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = requirements
    .filter((item) => !present.has(`${item.table}.${item.column}`))
    .map((item) => ({ table: item.table, column: item.column }));

  return {
    ready: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
}
