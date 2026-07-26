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

export function isMissingSchemaColumnError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2022") return true;
    const metaText = error.meta ? JSON.stringify(error.meta) : "";
    const combined = `${error.message} ${metaText}`;
    if (/column .* does not exist/i.test(combined) || /does not exist in the current database/i.test(combined)) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /column .* does not exist/i.test(message) || /does not exist in the current database/i.test(message);
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

export async function activePropertyRelationFilter(): Promise<
  { property: { deleted_at: null } } | Record<string, never>
> {
  return (await hasSoftDeleteColumn("Property")) ? { property: { deleted_at: null } } : {};
}
