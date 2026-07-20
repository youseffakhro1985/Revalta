import type { WorkOrderStatusEventRow } from "@/lib/work-order-enterprise-core";

const statusLabels: Record<string, string> = {
  new: "Ny",
  planned: "Planerad",
  in_progress: "Pågår",
  waiting_material: "Väntar på material",
  blocked: "Blockerad",
  completed: "Slutförd",
  invoiced: "Fakturerad",
  cancelled: "Makulerad",
};

type WorkOrderSummary = {
  id: string;
  title: string;
  workOrderNumber: string | null;
  createdAt: Date;
  assignedTo: { name: string | null; email: string } | null;
};

export type TicketWorkOrderTimelineItem = {
  id: string;
  type: "work_order_created" | "work_order_status";
  title: string;
  description: string;
  created_at: Date;
  href: string;
};

export function workOrderStatusLabel(status: string | null) {
  if (!status) return "Ingen tidigare status";
  return statusLabels[status] || status;
}

export function buildTicketWorkOrderTimeline(
  workOrder: WorkOrderSummary,
  events: WorkOrderStatusEventRow[],
): TicketWorkOrderTimelineItem[] {
  const reference = workOrder.workOrderNumber || `AO ${workOrder.id.slice(0, 8)}`;
  const assignee = workOrder.assignedTo?.name || workOrder.assignedTo?.email || "Ej tilldelad";
  const href = `/dashboard/arbetsorder/${workOrder.id}`;

  return [
    {
      id: `work-order-created-${workOrder.id}`,
      type: "work_order_created",
      title: `Arbetsorder ${reference} skapad`,
      description: `${workOrder.title} · Ansvarig: ${assignee}`,
      created_at: workOrder.createdAt,
      href,
    },
    ...events.map((event) => {
      const actor = event.actor_name || event.actor_email || "System";
      const transition = event.from_status
        ? `${workOrderStatusLabel(event.from_status)} → ${workOrderStatusLabel(event.to_status)}`
        : workOrderStatusLabel(event.to_status);
      const reason = event.reason ? ` · Orsak: ${event.reason}` : "";

      return {
        id: `work-order-event-${event.id}`,
        type: "work_order_status" as const,
        title: `Arbetsorder ${reference}: ${transition}`,
        description: `${actor}${reason}`,
        created_at: event.created_at,
        href,
      };
    }),
  ];
}
