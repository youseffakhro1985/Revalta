import {
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketStatus,
} from "@/lib/domain-labels";

export { TICKET_STATUS_LABELS, TICKET_STATUSES, type TicketStatus };

const TICKET_STATUS_SET = new Set<string>(TICKET_STATUSES);

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && TICKET_STATUS_SET.has(value);
}

/** Map leftover work-order/lifecycle values stored on tickets onto the ticket domain. */
export function normalizeTicketStatus(value: unknown): TicketStatus {
  if (isTicketStatus(value)) return value;
  switch (value) {
    case "assigned":
    case "planned":
      return "received";
    case "waiting_material":
    case "blocked":
      return "waiting";
    case "inspection":
      return "in_progress";
    case "invoiced":
    case "cancelled":
      return "closed";
    default:
      return "new";
  }
}

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ["received", "in_progress", "closed"],
  received: ["in_progress", "waiting", "completed", "closed"],
  in_progress: ["received", "waiting", "completed", "closed"],
  waiting: ["in_progress", "completed", "closed"],
  completed: ["in_progress", "closed"],
  closed: ["received", "in_progress"],
};

export function allowedTicketTransitions(status: TicketStatus) {
  return TRANSITIONS[status];
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isTerminalTicketStatus(status: TicketStatus) {
  return status === "closed";
}

export function ticketStatusRequiresAssignee(status: TicketStatus) {
  return status === "in_progress";
}

export function deriveTicketStatus(input: {
  current: TicketStatus;
  requested?: TicketStatus;
  assignedToId?: string | null;
}) {
  if (input.requested) return input.requested;
  if (input.current === "new" && input.assignedToId) return "received";
  return input.current;
}

export function ticketStatusLabel(status: TicketStatus) {
  return TICKET_STATUS_LABELS[status];
}

/** Stored leftovers that should match a canonical ticket-status list filter. */
export function ticketStatusFilterValues(status: string): string[] {
  const canonical = isTicketStatus(status) ? status : normalizeTicketStatus(status);
  if (!isTicketStatus(status) && canonical === "new" && status !== "new") {
    return [status];
  }
  switch (canonical) {
    case "received":
      return ["received", "assigned", "planned"];
    case "waiting":
      return ["waiting", "waiting_material", "blocked"];
    case "in_progress":
      return ["in_progress", "inspection"];
    case "closed":
      return ["closed", "cancelled", "invoiced"];
    default:
      return [canonical];
  }
}
