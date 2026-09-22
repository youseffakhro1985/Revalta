import { Prisma, type PrismaClient } from "@prisma/client";

const FEATURE_COLUMN_TTL_MS = 15_000;
const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "update",
  "upsert",
]);

let workOrderColumnCache: { columns: Set<string>; expiresAt: number } | null = null;

export function resetWorkOrderNotesCache() {
  workOrderColumnCache = null;
}

export function workOrderNotesWrite(hasColumn: boolean, notes: string | null) {
  return hasColumn && notes ? { notes } : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function relationModel(parentModel: string, fieldName: string): string | null {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === parentModel);
  const field = model?.fields.find((item) => item.name === fieldName && item.kind === "object");
  return field?.type ?? null;
}

function workOrderScalarNames(): string[] {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === "WorkOrder");
  return (model?.fields ?? []).filter((field) => field.kind === "scalar").map((field) => field.name);
}

/** Prisma 5 omitApi is preview-only; select only WorkOrder scalars that exist on the live DB. */
export function workOrderScalarSelectWithoutNotes(existingColumns?: Set<string>): Record<string, true> {
  const select: Record<string, true> = {};
  for (const name of workOrderScalarNames()) {
    if (existingColumns && existingColumns.size > 0) {
      if (existingColumns.has(name)) select[name] = true;
      continue;
    }
    if (name !== "notes") select[name] = true;
  }
  return select;
}

function stripMissingWorkOrderScalars(value: unknown, existing: Set<string>, inData: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => stripMissingWorkOrderScalars(item, existing, inData));
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  const scalars = new Set(workOrderScalarNames());
  for (const [key, child] of Object.entries(value)) {
    if (inData && scalars.has(key) && (existing.size === 0 ? key === "notes" : !existing.has(key))) continue;
    next[key] = key === "data" || key === "select" || key === "omit"
      ? stripMissingWorkOrderScalars(child, existing, key === "data" || inData)
      : child;
  }
  return next;
}

function applyWorkOrderReadShape(args: Record<string, unknown>, existing: Set<string>) {
  if (isPlainObject(args.select)) {
    for (const key of Object.keys(args.select)) {
      if (key === "notes" || (existing.size > 0 && workOrderScalarNames().includes(key) && !existing.has(key))) {
        delete args.select[key];
      }
    }
    return;
  }
  const scalars = workOrderScalarSelectWithoutNotes(existing);
  if (isPlainObject(args.include)) {
    args.select = { ...scalars, ...args.include };
    delete args.include;
    return;
  }
  args.select = scalars;
}

function walkWorkOrderReads(parentModel: string, bag: Record<string, unknown>, existing: Set<string>) {
  for (const [fieldName, fieldArgs] of Object.entries(bag)) {
    const childModel = relationModel(parentModel, fieldName);
    if (fieldArgs === true) {
      if (childModel === "WorkOrder") {
        bag[fieldName] = { select: workOrderScalarSelectWithoutNotes(existing) };
      }
      continue;
    }
    if (!isPlainObject(fieldArgs)) continue;
    if (childModel === "WorkOrder") applyWorkOrderReadShape(fieldArgs, existing);
    if (childModel && isPlainObject(fieldArgs.include)) walkWorkOrderReads(childModel, fieldArgs.include, existing);
    if (childModel && isPlainObject(fieldArgs.select)) walkWorkOrderReads(childModel, fieldArgs.select, existing);
  }
}

export async function listWorkOrderColumns(client: PrismaClient): Promise<Set<string>> {
  if (workOrderColumnCache && workOrderColumnCache.expiresAt > Date.now()) {
    return workOrderColumnCache.columns;
  }
  if (typeof client?.$queryRaw !== "function") {
    const columns = new Set<string>();
    workOrderColumnCache = { columns, expiresAt: Date.now() + FEATURE_COLUMN_TTL_MS };
    return columns;
  }
  const rows = await client.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrder'
  `;
  const columns = new Set(rows.map((row) => row.column_name));
  workOrderColumnCache = { columns, expiresAt: Date.now() + FEATURE_COLUMN_TTL_MS };
  return columns;
}

export async function hasWorkOrderNotesColumn(client: PrismaClient): Promise<boolean> {
  const columns = await listWorkOrderColumns(client);
  return columns.has("notes");
}

/** Prisma schema has WorkOrder.notes but no migration added the column. Omit it until Database Release. */
export async function sanitizeWorkOrderNotesArgs(
  client: PrismaClient,
  model: string | undefined,
  action: string,
  args: unknown,
): Promise<unknown> {
  const existing = await listWorkOrderColumns(client);
  if (existing.size > 0) {
    const missing = workOrderScalarNames().filter((name) => !existing.has(name));
    if (missing.length === 0) return args;
  }
  const next = (args == null ? {} : stripMissingWorkOrderScalars({ ...(args as object) }, existing, false)) as Record<string, unknown>;
  if (model === "WorkOrder" && READ_OPS.has(action)) {
    applyWorkOrderReadShape(next, existing);
  }
  if (model && isPlainObject(next.include)) walkWorkOrderReads(model, next.include, existing);
  if (model && isPlainObject(next.select)) walkWorkOrderReads(model, next.select, existing);
  return next;
}
