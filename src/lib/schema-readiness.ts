import { Prisma } from "@prisma/client";
import { getPrismaBaseClient } from "@/lib/db";
import {
  REQUIRED_SOFT_DELETE_COLUMNS,
  SOFT_DELETE_MODELS,
  getMissingSoftDeleteModels,
  resetSoftDeleteCompatCache,
  type SoftDeleteModel,
} from "@/lib/soft-delete-compat";

export { REQUIRED_SOFT_DELETE_COLUMNS, SOFT_DELETE_MODELS };
export type SoftDeleteTable = SoftDeleteModel;
export type SchemaColumnRequirement = (typeof REQUIRED_SOFT_DELETE_COLUMNS)[number];

export type SchemaMissingItem = { table: string; column: string };

export type SchemaReadiness = {
  ready: boolean;
  missing: SchemaMissingItem[];
  checkedAt: string;
};

/** Tables that APIs query directly and that 500 when absent even if soft-delete columns exist. */
export const REQUIRED_OPERATIONAL_TABLES = ["InspectionChecklistTemplate"] as const;

export function formatSchemaMissingItem(item: SchemaMissingItem) {
  return item.column === "*" ? item.table : `${item.table}.${item.column}`;
}

export function formatSchemaMissing(missing: unknown) {
  if (!Array.isArray(missing) || missing.length === 0) return "";
  return missing
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "table" in item) {
        const table = String((item as SchemaMissingItem).table || "").trim();
        const column = String((item as SchemaMissingItem).column || "").trim();
        if (!table) return "";
        return formatSchemaMissingItem({ table, column: column || "*" });
      }
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

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
  return /column .+ does not exist/i.test(errorText(error));
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

export async function getSchemaReadiness(): Promise<SchemaReadiness> {
  const client = getPrismaBaseClient();
  const missingModels = await getMissingSoftDeleteModels(client);
  const missing: SchemaMissingItem[] = [...missingModels].map((table) => ({ table, column: "deleted_at" }));

  const requiredTables = [...REQUIRED_OPERATIONAL_TABLES];
  const tableRows = await client.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(requiredTables)})
  `;
  const presentTables = new Set(tableRows.map((row) => row.table_name));
  for (const table of REQUIRED_OPERATIONAL_TABLES) {
    if (!presentTables.has(table)) {
      missing.push({ table, column: "*" });
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
}

const FEATURE_COLUMN_TTL_MS = 15_000;
let featureColumnCache: { aiSource: boolean; expiresAt: number } | null = null;

export function ticketAiSourceWrite(hasColumn: boolean, source: string) {
  return hasColumn ? { ai_source: source } : {};
}

export function ticketAiSourceSelect(hasColumn: boolean) {
  return hasColumn ? { ai_source: true as const } : {};
}

export async function hasTicketAiSourceColumn(): Promise<boolean> {
  if (featureColumnCache && featureColumnCache.expiresAt > Date.now()) {
    return featureColumnCache.aiSource;
  }
  const rows = await getPrismaBaseClient().$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Ticket'
      AND column_name = 'ai_source'
    LIMIT 1
  `;
  const aiSource = rows.length > 0;
  featureColumnCache = { aiSource, expiresAt: Date.now() + FEATURE_COLUMN_TTL_MS };
  return aiSource;
}

export function resetSchemaReadinessCache() {
  resetSoftDeleteCompatCache();
  featureColumnCache = null;
}

export async function getCachedSchemaReadiness(): Promise<SchemaReadiness> {
  return getSchemaReadiness();
}

export async function hasSoftDeleteColumn(table: SoftDeleteTable): Promise<boolean> {
  const missing = await getMissingSoftDeleteModels(getPrismaBaseClient());
  return !missing.has(table);
}

export async function notDeletedFilter(
  table: SoftDeleteTable,
): Promise<{ deleted_at: null } | Record<string, never>> {
  return (await hasSoftDeleteColumn(table)) ? { deleted_at: null } : {};
}

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
