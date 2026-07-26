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
export type SoftDeleteTable = SchemaColumnRequirement["table"];

export type SchemaReadiness = {
  ready: boolean;
  missing: Array<{ table: string; column: string }>;
  checkedAt: string;
};

type ColumnRow = {
  table_name: string;
  column_name: string;
};

const CACHE_TTL_MS = 15_000;
let readinessCache: { value: SchemaReadiness; expiresAt: number } | null = null;

function errorText(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.message} ${error.meta ? JSON.stringify(error.meta) : ""}`;
  }
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isMissingSchemaColumnError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return true;
  }
  const combined = errorText(error);
  // Require "column" so missing *tables* (P2021) are not misclassified.
  return /column .+ does not exist/i.test(combined);
}

export function isMissingTableError(error: unknown, table?: string): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    if (!table) return true;
    return errorText(error).toLowerCase().includes(table.toLowerCase());
  }
  const combined = errorText(error);
  if (/column .+ does not exist/i.test(combined)) return false;
  if (!/does not exist/i.test(combined)) return false;
  if (!table) return /table .+ does not exist/i.test(combined) || /relation .+ does not exist/i.test(combined);
  return combined.toLowerCase().includes(table.toLowerCase());
}

export function schemaMismatchUserMessage() {
  return "Databasen saknar obligatoriska kolumner för den här versionen. Kör Database Release (prisma migrate deploy) för samma commit innan soft-delete och full preview fungerar mot produktionsdatabasen.";
}

export function schemaCompatibilityBannerMessage() {
  return "Databasschema väntar på Database Release. Listor körs tillfälligt utan soft-delete-filter så att du kan arbeta vidare i preview.";
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

export function resetSchemaReadinessCache() {
  readinessCache = null;
}

export async function getCachedSchemaReadiness(): Promise<SchemaReadiness> {
  if (readinessCache && readinessCache.expiresAt > Date.now()) {
    return readinessCache.value;
  }
  const value = await getSchemaReadiness();
  readinessCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function hasSoftDeleteColumn(table: SoftDeleteTable): Promise<boolean> {
  const readiness = await getCachedSchemaReadiness();
  return !readiness.missing.some((item) => item.table === table && item.column === "deleted_at");
}

/** Prisma where fragment: `{ deleted_at: null }` when the column exists, otherwise `{}`. */
export async function notDeletedFilter(
  table: SoftDeleteTable,
): Promise<{ deleted_at: null } | Record<string, never>> {
  return (await hasSoftDeleteColumn(table)) ? { deleted_at: null } : {};
}

/**
 * When soft-delete columns are missing, Prisma must not SELECT them
 * (schema includes the field even if the DB column is absent).
 */
export async function softDeleteOmit(
  table: SoftDeleteTable,
): Promise<{ deleted_at: true } | undefined> {
  return (await hasSoftDeleteColumn(table)) ? undefined : { deleted_at: true };
}

export async function activePropertyRelationFilter(): Promise<
  { property: { deleted_at: null } } | Record<string, never>
> {
  return (await hasSoftDeleteColumn("Property")) ? { property: { deleted_at: null } } : {};
}
