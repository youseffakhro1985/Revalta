export type DualListOptions<U> = {
  /** Skip legacy rows whose storage marker matches a modern table write */
  modernStorage?: string;
  /** Extract the modern entity id mirrored by a legacy row */
  legacyEntityId?: (row: U) => string | null | undefined;
  /** Extract storage marker from a legacy row */
  legacyStorage?: (row: U) => string | null | undefined;
};

/**
 * After production backfill is verified, set REVALTA_MODERN_STORAGE_ONLY=1
 * to stop merging AuditLog/IntegrationEvent product rows into list APIs.
 * Default remains dual-read so unrebacked tenants keep visibility.
 */
export function isModernStorageOnly() {
  return process.env.REVALTA_MODERN_STORAGE_ONLY === "1";
}

export function isModernStorageMirror(
  metadata: unknown,
  modernStorage: string,
  modernIds: Set<string>,
  entityId?: string | null,
) {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : null;
  if (meta?.storage === modernStorage) return true;
  if (entityId && modernIds.has(entityId)) return true;
  return false;
}

export function mergeByCreatedAt<T extends { id: string; created_at: Date }, U extends { id: string; created_at: Date }>(
  modern: T[],
  legacy: U[],
  limit: number,
  options: DualListOptions<U> = {},
): Array<T | U> {
  if (isModernStorageOnly()) {
    return [...modern]
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
      .slice(0, limit);
  }

  const modernIds = new Set(modern.map((row) => row.id));
  const filtered = legacy.filter((row) => {
    if (modernIds.has(row.id)) return false;
    const storage = options.legacyStorage?.(row)
      ?? ("storage" in row ? String((row as { storage?: unknown }).storage ?? "") : "");
    if (options.modernStorage && storage === options.modernStorage) return false;
    const entityId = options.legacyEntityId?.(row);
    if (entityId && modernIds.has(entityId)) return false;
    return true;
  });

  return [...modern, ...filtered]
    .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
    .slice(0, limit);
}

export function asNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function parseOptionalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
