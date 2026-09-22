import { Prisma, type PrismaClient } from "@prisma/client";

const FEATURE_COLUMN_TTL_MS = 15_000;
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

let notesColumnCache: { value: boolean; expiresAt: number } | null = null;

export function resetWorkOrderNotesCache() {
  notesColumnCache = null;
}

export function workOrderNotesWrite(hasColumn: boolean, notes: string | null) {
  return hasColumn && notes ? { notes } : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function stripNotesFromData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripNotesFromData(item));
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "notes") continue;
    next[key] = key === "data" || key === "select" || key === "omit" ? stripNotesFromData(child) : child;
  }
  return next;
}

function relationModel(parentModel: string, fieldName: string): string | null {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === parentModel);
  const field = model?.fields.find((item) => item.name === fieldName && item.kind === "object");
  return field?.type ?? null;
}

function applyOmitNotes(args: Record<string, unknown>) {
  if (isPlainObject(args.select)) {
    delete args.select.notes;
    return;
  }
  const currentOmit = isPlainObject(args.omit) ? args.omit : {};
  args.omit = { ...currentOmit, notes: true };
}

function walkWorkOrderOmit(parentModel: string, bag: Record<string, unknown>) {
  for (const [fieldName, fieldArgs] of Object.entries(bag)) {
    const childModel = relationModel(parentModel, fieldName);
    if (fieldArgs === true) {
      if (childModel === "WorkOrder") {
        bag[fieldName] = { omit: { notes: true } };
      }
      continue;
    }
    if (!isPlainObject(fieldArgs)) continue;
    if (childModel === "WorkOrder") applyOmitNotes(fieldArgs);
    if (childModel && isPlainObject(fieldArgs.include)) walkWorkOrderOmit(childModel, fieldArgs.include);
    if (childModel && isPlainObject(fieldArgs.select)) walkWorkOrderOmit(childModel, fieldArgs.select);
  }
}

export async function hasWorkOrderNotesColumn(client: PrismaClient): Promise<boolean> {
  if (notesColumnCache && notesColumnCache.expiresAt > Date.now()) {
    return notesColumnCache.value;
  }
  const rows = await client.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrder'
      AND column_name = 'notes'
    LIMIT 1
  `;
  const value = rows.length > 0;
  notesColumnCache = { value, expiresAt: Date.now() + FEATURE_COLUMN_TTL_MS };
  return value;
}

/** Prisma schema has WorkOrder.notes but no migration added the column. Omit it until Database Release. */
export async function sanitizeWorkOrderNotesArgs(
  client: PrismaClient,
  model: string | undefined,
  action: string,
  args: unknown,
): Promise<unknown> {
  if (await hasWorkOrderNotesColumn(client)) return args;
  const next = (args == null ? {} : stripNotesFromData({ ...(args as object) })) as Record<string, unknown>;
  if (model === "WorkOrder") {
    if (OMIT_OPS.has(action) && !isPlainObject(next.select)) {
      applyOmitNotes(next);
    } else if (isPlainObject(next.select) && "notes" in next.select) {
      delete next.select.notes;
    }
  }
  if (model && isPlainObject(next.include)) walkWorkOrderOmit(model, next.include);
  if (model && isPlainObject(next.select)) walkWorkOrderOmit(model, next.select);
  return next;
}
