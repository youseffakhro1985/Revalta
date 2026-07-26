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

export type SchemaReadiness = {
  ready: boolean;
  missing: Array<{ table: string; column: string }>;
  checkedAt: string;
};

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
  const missingModels = await getMissingSoftDeleteModels(getPrismaBaseClient());
  const missing = [...missingModels].map((table) => ({ table, column: "deleted_at" }));
  return {
    ready: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
}

export function resetSchemaReadinessCache() {
  resetSoftDeleteCompatCache();
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
