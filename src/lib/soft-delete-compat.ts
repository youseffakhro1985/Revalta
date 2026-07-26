import { Prisma, type PrismaClient } from "@prisma/client";

/** Models that have `deleted_at` in Prisma schema / migrations. */
export const SOFT_DELETE_MODELS = [
  "Ticket",
  "Property",
  "WorkOrder",
  "Project",
  "Lease",
  "LeaseHolder",
  "AppNotification",
  "OperationalDocument",
  "TicketOperation",
] as const;

export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

export const REQUIRED_SOFT_DELETE_COLUMNS = SOFT_DELETE_MODELS.map((table) => ({
  table,
  column: "deleted_at" as const,
}));

const CACHE_TTL_MS = 15_000;
let missingCache: { missing: Set<string>; expiresAt: number } | null = null;

type ColumnRow = { table_name: string; column_name: string };

export function resetSoftDeleteCompatCache() {
  missingCache = null;
}

export async function getMissingSoftDeleteModels(client: PrismaClient): Promise<Set<string>> {
  if (missingCache && missingCache.expiresAt > Date.now()) {
    return missingCache.missing;
  }

  const tables = [...SOFT_DELETE_MODELS];
  const rows = await client.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(tables)})
      AND column_name = 'deleted_at'
  `;
  const present = new Set(rows.map((row) => row.table_name));
  const missing = new Set(SOFT_DELETE_MODELS.filter((table) => !present.has(table)));
  missingCache = { missing, expiresAt: Date.now() + CACHE_TTL_MS };
  return missing;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

/** Remove every `deleted_at` key from a nested Prisma args tree. */
export function stripDeletedAtKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripDeletedAtKeys(item)) as T;
  }
  if (!isPlainObject(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "deleted_at") continue;
    next[key] = stripDeletedAtKeys(child);
  }
  return next as T;
}

function relationModel(parentModel: string, fieldName: string): string | null {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === parentModel);
  const field = model?.fields.find((item) => item.name === fieldName && item.kind === "object");
  return field?.type ?? null;
}

function applyOmitForMissing(
  model: string | null | undefined,
  args: Record<string, unknown>,
  missing: Set<string>,
) {
  if (!model || !missing.has(model)) return;

  if (isPlainObject(args.select)) {
    delete args.select.deleted_at;
    return;
  }

  const currentOmit = isPlainObject(args.omit) ? args.omit : {};
  args.omit = { ...currentOmit, deleted_at: true };
}

function walkRelationBag(
  parentModel: string,
  bag: Record<string, unknown> | undefined,
  missing: Set<string>,
) {
  if (!bag || !parentModel) return;

  for (const [fieldName, fieldArgs] of Object.entries(bag)) {
    const childModel = relationModel(parentModel, fieldName);

    if (fieldArgs === true) {
      if (childModel && missing.has(childModel)) {
        bag[fieldName] = { omit: { deleted_at: true } };
      }
      continue;
    }
    if (!isPlainObject(fieldArgs)) continue;

    const nested = stripDeletedAtKeys({ ...fieldArgs }) as Record<string, unknown>;
    applyOmitForMissing(childModel, nested, missing);

    if (isPlainObject(nested.include) && childModel) {
      walkRelationBag(childModel, nested.include, missing);
    }
    if (isPlainObject(nested.select) && childModel) {
      for (const [nestedField, nestedArgs] of Object.entries(nested.select)) {
        if (nestedArgs === true || !isPlainObject(nestedArgs)) continue;
        const nestedModel = relationModel(childModel, nestedField);
        const cleaned = stripDeletedAtKeys({ ...nestedArgs }) as Record<string, unknown>;
        applyOmitForMissing(nestedModel, cleaned, missing);
        if (isPlainObject(cleaned.include) && nestedModel) {
          walkRelationBag(nestedModel, cleaned.include, missing);
        }
        nested.select[nestedField] = cleaned;
      }
    }

    bag[fieldName] = nested;
  }
}

const OMIT_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "update",
  "upsert",
]);

export async function sanitizeSoftDeleteArgs(
  client: PrismaClient,
  model: string | undefined,
  operation: string,
  args: unknown,
): Promise<unknown> {
  const missing = await getMissingSoftDeleteModels(client);
  if (missing.size === 0) return args;

  const original = isPlainObject(args) ? args : null;
  const originalData = original && isPlainObject(original.data) ? original.data : null;
  const wroteDeletedAt = Boolean(originalData && "deleted_at" in originalData);

  const next = (args == null ? {} : stripDeletedAtKeys({ ...(args as object) })) as Record<string, unknown>;

  // Soft-delete writes must fail closed until migrate (restore deleted_at into data).
  if (wroteDeletedAt && model && missing.has(model)) {
    next.data = {
      ...(isPlainObject(next.data) ? next.data : {}),
      deleted_at: originalData!.deleted_at,
    };
  }

  if (model && OMIT_OPS.has(operation)) {
    applyOmitForMissing(model, next, missing);
  }

  if (model && isPlainObject(next.include)) walkRelationBag(model, next.include, missing);
  if (model && isPlainObject(next.select)) walkRelationBag(model, next.select, missing);

  return next;
}

/** Raw-SQL fragment: `AND alias."deleted_at" IS NULL` when column exists, else empty. */
export async function sqlSoftDeleteGuard(
  client: PrismaClient,
  table: SoftDeleteModel,
  alias: string,
): Promise<Prisma.Sql> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid SQL alias for soft-delete guard: ${alias}`);
  }
  const missing = await getMissingSoftDeleteModels(client);
  if (missing.has(table)) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.raw(`"${alias}"."deleted_at"`)} IS NULL`;
}
