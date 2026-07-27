/** Shared helpers for soft-delete restore flows. */

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** Prefer audited previousStatus when delete forced status to cancelled. */
export function resolveRestoredProjectStatus(currentStatus: string, previousStatus: unknown): string {
  if (isProjectStatus(previousStatus) && previousStatus !== "cancelled") {
    return previousStatus;
  }
  if (currentStatus === "completed") return currentStatus;
  if (isProjectStatus(previousStatus)) return previousStatus;
  return currentStatus === "cancelled" ? "planned" : currentStatus;
}

export function readAuditPreviousStatus(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  return (metadata as Record<string, unknown>).previousStatus;
}
