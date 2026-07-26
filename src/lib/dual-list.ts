export function mergeByCreatedAt<T extends { id: string; created_at: Date }, U extends { id: string; created_at: Date }>(
  modern: T[],
  legacy: U[],
  limit: number,
): Array<T | U> {
  const modernIds = new Set(modern.map((row) => row.id));
  return [...modern, ...legacy.filter((row) => !modernIds.has(row.id))]
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
