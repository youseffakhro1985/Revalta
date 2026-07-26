import { calculateResolutionDueAt, formatSlaResolutionLabel } from "@/lib/sla-policy";

export function calculateDueDate(priority: string, from = new Date()) {
  return calculateResolutionDueAt(priority, from);
}

export function getSlaLabel(priority: string) {
  return formatSlaResolutionLabel(priority);
}
