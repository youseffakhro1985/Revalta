import db from "@/lib/db";

export type NotificationChannel = "service_center" | "work_order_sla" | "work_order_lock" | "recurring";

type LegacyTypes = {
  readType: string;
  snoozeType: string;
};

const channelLegacy: Record<NotificationChannel, LegacyTypes> = {
  service_center: { readType: "service_notification_read", snoozeType: "service_notification_snooze" },
  work_order_sla: { readType: "work_order_sla_notification_read", snoozeType: "work_order_sla_notification_snooze" },
  work_order_lock: { readType: "work_order_lock_notification_read", snoozeType: "work_order_lock_notification_snooze" },
  recurring: { readType: "recurring_notification_read", snoozeType: "recurring_notification_snooze" },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function keyFromPayload(value: unknown) {
  const key = asObject(value)?.notificationKey;
  return typeof key === "string" ? key : null;
}

export async function getNotificationUxState(companyId: string, userId: string, channel: NotificationChannel) {
  const modern = await db.notificationUxState.findMany({
    where: { company_id: companyId, user_id: userId, channel },
    take: 5000,
  });
  const read = new Set<string>();
  const snooze = new Map<string, Date | null>();
  for (const row of modern) {
    if (row.read_at) read.add(row.notification_key);
    if (row.snooze_cleared_at) snooze.set(row.notification_key, null);
    else if (row.snoozed_until) snooze.set(row.notification_key, row.snoozed_until);
  }

  const legacy = channelLegacy[channel];
  const [reads, snoozes] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: legacy.readType, recipient: userId, status: "read" },
      select: { payload: true },
      take: 2000,
    }),
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: legacy.snoozeType, recipient: userId },
      orderBy: { created_at: "desc" },
      select: { status: true, payload: true },
      take: 3000,
    }),
  ]);

  for (const item of reads) {
    const key = keyFromPayload(item.payload);
    if (key) read.add(key);
  }
  for (const event of snoozes) {
    const key = keyFromPayload(event.payload);
    if (!key || snooze.has(key)) continue;
    if (event.status === "cleared") {
      snooze.set(key, null);
      continue;
    }
    const untilRaw = asObject(event.payload)?.snoozedUntil;
    const until = typeof untilRaw === "string" ? new Date(untilRaw) : null;
    snooze.set(key, until && !Number.isNaN(until.getTime()) ? until : null);
  }

  return { read, snooze };
}

export async function markNotificationsRead(
  companyId: string,
  userId: string,
  channel: NotificationChannel,
  keys: string[],
) {
  const now = new Date();
  for (const key of keys) {
    await db.notificationUxState.upsert({
      where: {
        company_id_user_id_channel_notification_key: {
          company_id: companyId,
          user_id: userId,
          channel,
          notification_key: key,
        },
      },
      create: {
        company_id: companyId,
        user_id: userId,
        channel,
        notification_key: key,
        read_at: now,
      },
      update: { read_at: now },
    });
  }
}

export async function snoozeNotifications(
  companyId: string,
  userId: string,
  channel: NotificationChannel,
  keys: string[],
  until: Date | null,
  clear = false,
) {
  const now = new Date();
  for (const key of keys) {
    await db.notificationUxState.upsert({
      where: {
        company_id_user_id_channel_notification_key: {
          company_id: companyId,
          user_id: userId,
          channel,
          notification_key: key,
        },
      },
      create: {
        company_id: companyId,
        user_id: userId,
        channel,
        notification_key: key,
        snoozed_until: clear ? null : until,
        snooze_cleared_at: clear ? now : null,
      },
      update: {
        snoozed_until: clear ? null : until,
        snooze_cleared_at: clear ? now : null,
      },
    });
  }
}
