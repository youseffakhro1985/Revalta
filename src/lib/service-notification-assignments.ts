import db from "@/lib/db";

export type AssignmentView = {
  notificationKey: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  deadline: string | null;
  note: string | null;
  changedBy?: string;
  updatedAt: string;
  companyId?: string;
  createdAt?: Date;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mapRow(row: {
  company_id: string;
  notification_key: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  status: string;
  deadline_at: Date | null;
  note: string | null;
  changed_by_id: string;
  updated_at: Date;
  created_at: Date;
}): AssignmentView {
  return {
    notificationKey: row.notification_key,
    assigneeId: row.assignee_user_id,
    assigneeName: row.assignee_name,
    status: row.status,
    deadline: row.deadline_at?.toISOString() ?? null,
    note: row.note,
    changedBy: row.changed_by_id,
    updatedAt: row.updated_at.toISOString(),
    companyId: row.company_id,
    createdAt: row.created_at,
  };
}

export async function listServiceNotificationAssignments(companyId?: string) {
  const modern = await db.serviceNotificationAssignment.findMany({
    where: companyId ? { company_id: companyId } : undefined,
    orderBy: { updated_at: "desc" },
    take: 10_000,
  });
  const byKey = new Map<string, AssignmentView>();
  for (const row of modern) {
    byKey.set(`${row.company_id}:${row.notification_key}`, mapRow(row));
  }

  const events = await db.integrationEvent.findMany({
    where: {
      type: "service_notification_assignment",
      ...(companyId ? { company_id: companyId } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 10_000,
    select: { company_id: true, payload: true, created_at: true },
  });
  for (const event of events) {
    const payload = asObject(event.payload);
    const key = typeof payload?.notificationKey === "string" ? payload.notificationKey : "";
    if (!key || !event.company_id) continue;
    const compound = `${event.company_id}:${key}`;
    if (byKey.has(compound)) continue;
    byKey.set(compound, {
      notificationKey: key,
      assigneeId: typeof payload?.assigneeId === "string" ? payload.assigneeId : null,
      assigneeName: typeof payload?.assigneeName === "string" ? payload.assigneeName : null,
      status: typeof payload?.status === "string" ? payload.status : "assigned",
      deadline: typeof payload?.deadline === "string" ? payload.deadline : null,
      note: typeof payload?.note === "string" ? payload.note : null,
      changedBy: typeof payload?.changedBy === "string" ? payload.changedBy : undefined,
      updatedAt: event.created_at.toISOString(),
      companyId: event.company_id,
      createdAt: event.created_at,
    });
  }

  return [...byKey.values()];
}

export async function upsertServiceNotificationAssignment(input: {
  companyId: string;
  notificationKey: string;
  assetId?: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  deadline: Date | null;
  note: string | null;
  changedById: string;
}) {
  const row = await db.serviceNotificationAssignment.upsert({
    where: {
      company_id_notification_key: {
        company_id: input.companyId,
        notification_key: input.notificationKey,
      },
    },
    create: {
      company_id: input.companyId,
      notification_key: input.notificationKey,
      asset_id: input.assetId ?? null,
      assignee_user_id: input.assigneeId,
      assignee_name: input.assigneeName,
      status: input.status,
      deadline_at: input.deadline,
      note: input.note,
      changed_by_id: input.changedById,
    },
    update: {
      asset_id: input.assetId ?? null,
      assignee_user_id: input.assigneeId,
      assignee_name: input.assigneeName,
      status: input.status,
      deadline_at: input.deadline,
      note: input.note,
      changed_by_id: input.changedById,
    },
  });
  return mapRow(row);
}
