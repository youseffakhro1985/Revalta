export type SlaPriority = "low" | "normal" | "high" | "urgent";

/**
 * Canonical SLA policy for Revalta.
 * - resolutionHours: ticket due dates and work-order risk deadlines
 * - responseHours: enterprise work-order first-response milestones
 */
export const SLA_POLICY: Record<SlaPriority, { responseHours: number; resolutionHours: number }> = {
  urgent: { responseHours: 1, resolutionHours: 4 },
  high: { responseHours: 4, resolutionHours: 24 },
  normal: { responseHours: 24, resolutionHours: 72 },
  low: { responseHours: 48, resolutionHours: 168 },
};

function normalizeSlaPriority(priorityValue: unknown): SlaPriority {
  return priorityValue === "low" || priorityValue === "high" || priorityValue === "urgent" || priorityValue === "normal"
    ? priorityValue
    : "normal";
}

export function getSlaPolicy(priorityValue: unknown) {
  return SLA_POLICY[normalizeSlaPriority(priorityValue)];
}

export function calculateResolutionDueAt(priorityValue: unknown, from = new Date()) {
  const { resolutionHours } = getSlaPolicy(priorityValue);
  return new Date(from.getTime() + resolutionHours * 60 * 60 * 1000);
}

export function calculateResponseDueAt(priorityValue: unknown, from = new Date()) {
  const { responseHours } = getSlaPolicy(priorityValue);
  return new Date(from.getTime() + responseHours * 60 * 60 * 1000);
}

export function formatSlaResolutionLabel(priorityValue: unknown) {
  const hours = getSlaPolicy(priorityValue).resolutionHours;
  if (hours < 24) return `${hours} timmar`;
  return `${Math.round(hours / 24)} dagar`;
}
