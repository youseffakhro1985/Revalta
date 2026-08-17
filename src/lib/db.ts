import { Prisma, PrismaClient } from "@prisma/client";
import { sanitizeSoftDeleteArgs, SOFT_DELETE_MODELS } from "@/lib/soft-delete-compat";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Raw / connection actions must never enter soft-delete sanitizing (avoids $queryRaw recursion). */
const PASSTHROUGH_ACTIONS = new Set([
  "queryRaw",
  "queryRawUnsafe",
  "executeRaw",
  "executeRawUnsafe",
  "runCommandRaw",
]);

const SOFT_DELETE_MODEL_SET = new Set<string>(SOFT_DELETE_MODELS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function containsDeletedAt(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsDeletedAt(item));
  if (!isPlainObject(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, "deleted_at")) return true;
  return Object.values(value).some((child) => containsDeletedAt(child));
}

function relationModel(parentModel: string, fieldName: string): string | null {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === parentModel);
  const field = model?.fields.find((item) => item.name === fieldName && item.kind === "object");
  return field?.type ?? null;
}

function relationBagTouchesSoftDeleteModel(
  parentModel: string,
  bag: Record<string, unknown> | undefined,
): boolean {
  if (!bag) return false;

  for (const [fieldName, fieldArgs] of Object.entries(bag)) {
    const childModel = relationModel(parentModel, fieldName);
    if (!childModel) continue;
    if (SOFT_DELETE_MODEL_SET.has(childModel)) return true;
    if (fieldArgs === true || !isPlainObject(fieldArgs)) continue;

    if (
      relationBagTouchesSoftDeleteModel(
        childModel,
        isPlainObject(fieldArgs.include) ? fieldArgs.include : undefined,
      ) ||
      relationBagTouchesSoftDeleteModel(
        childModel,
        isPlainObject(fieldArgs.select) ? fieldArgs.select : undefined,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Compatibility inspection is only needed when the current query can actually
 * touch one of the models whose `deleted_at` migration may be missing. This
 * keeps simple infrastructure/auth queries away from the information_schema
 * probe while preserving nested relation protection for soft-delete models.
 */
export function shouldSanitizeSoftDeleteParams(params: {
  model?: string;
  action: string;
  args?: unknown;
}): boolean {
  if (!params.model) return false;
  if (PASSTHROUGH_ACTIONS.has(params.action)) return false;
  if (SOFT_DELETE_MODEL_SET.has(params.model)) return true;
  if (containsDeletedAt(params.args)) return true;
  if (!isPlainObject(params.args)) return false;

  return (
    relationBagTouchesSoftDeleteModel(
      params.model,
      isPlainObject(params.args.include) ? params.args.include : undefined,
    ) ||
    relationBagTouchesSoftDeleteModel(
      params.model,
      isPlainObject(params.args.select) ? params.args.select : undefined,
    )
  );
}

function createPrismaClient() {
  const client = new PrismaClient();

  // Middleware keeps PrismaClient typings stable while stripping soft-delete
  // filters/columns when migrations are not deployed yet on shared preview DBs.
  client.$use(async (params, next) => {
    if (shouldSanitizeSoftDeleteParams(params)) {
      params.args = await sanitizeSoftDeleteArgs(
        client,
        params.model,
        params.action,
        params.args,
      );
    }
    return next(params);
  });

  return client;
}

const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Same client; readiness uses $queryRaw which bypasses soft-delete middleware. */
export function getPrismaBaseClient() {
  return db;
}

export default db;
