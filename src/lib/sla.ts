const priorityHours: Record<string, number> = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168,
};

export function calculateDueDate(priority: string, from = new Date()) {
  const hours = priorityHours[priority] ?? priorityHours.normal;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function getSlaLabel(priority: string) {
  const hours = priorityHours[priority] ?? priorityHours.normal;
  if (hours < 24) return `${hours} timmar`;
  return `${Math.round(hours / 24)} dagar`;
}
