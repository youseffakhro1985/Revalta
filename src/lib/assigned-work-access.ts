import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canViewLeasingData,
  type CurrentUser,
  shouldScopeToAssignedWork,
  tenantWhere,
} from "@/lib/current-user";

/** Hide existence of out-of-scope work from technicians (and similar roles). */
export function notFoundTicket() {
  return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
}

export function notFoundWorkOrder() {
  return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
}

export function isAssignedWorkAccessible(
  user: Pick<CurrentUser, "id" | "role">,
  assignedToId: string | null | undefined,
) {
  if (!shouldScopeToAssignedWork(user.role)) return true;
  return assignedToId === user.id;
}

export function redactTicketReporterPii<
  T extends {
    reporter_name?: string | null;
    reporter_email?: string | null;
    reporter_phone?: string | null;
    reporter_unit?: string | null;
  },
>(user: Pick<CurrentUser, "role">, ticket: T): T {
  if (canViewLeasingData(user.role)) return ticket;
  return {
    ...ticket,
    reporter_name: null,
    reporter_email: null,
    reporter_phone: null,
    reporter_unit: null,
  };
}

type TicketAccessRow = { id: string; assigned_to_id: string | null; property_id: string | null };

export async function findAccessibleTicket(
  user: CurrentUser,
  id: string,
): Promise<TicketAccessRow | null> {
  const ticket = await db.ticket.findFirst({
    where: {
      id,
      deleted_at: null,
      ...tenantWhere(user),
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
    },
    select: { id: true, assigned_to_id: true, property_id: true },
  });
  if (!ticket) return null;
  if (!isAssignedWorkAccessible(user, ticket.assigned_to_id)) return null;
  return ticket;
}

type WorkOrderAccessSelect = {
  id: true;
  assigned_to_id: true;
  title?: true;
};

export async function findAccessibleWorkOrder(
  user: CurrentUser & { company_id: string },
  id: string,
  select: WorkOrderAccessSelect = { id: true, assigned_to_id: true },
) {
  const workOrder = await db.workOrder.findFirst({
    where: {
      deleted_at: null,
      id,
      company_id: user.company_id,
      property: { deleted_at: null },
    },
    select: { ...select, assigned_to_id: true, id: true },
  });
  if (!workOrder) return null;
  if (!isAssignedWorkAccessible(user, workOrder.assigned_to_id)) return null;
  return workOrder;
}
