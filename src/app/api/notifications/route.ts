import db from "@/lib/db";
import { canViewAudit, canViewOperations, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt, loadLegacyRows } from "@/lib/dual-list";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/notifications" });

const createdAction = "notification.created";
const readAction = "notification.read";

function scopeFor(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return user.company_id ? { company_id: user.company_id } : { actor_user_id: user.id };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const scope = scopeFor(user);
    const includeAudit = canViewAudit(user.role);
    const [modern, modernReads, notifications, readLogs, recentEventsRaw] = await Promise.all([
      user.company_id
        ? db.appNotification.findMany({
            where: { company_id: user.company_id, deleted_at: null },
            orderBy: { created_at: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
      user.company_id
        ? db.notificationRead.findMany({
            where: { company_id: user.company_id, reader_user_id: user.id },
            select: { notification_id: true },
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...scope, action: createdAction },
        orderBy: { created_at: "desc" },
        take: 100,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...scope, action: readAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { entity_id: true, metadata: true },
      })),
      includeAudit
        ? loadLegacyRows(() => db.auditLog.findMany({
            where: { ...scope, action: { notIn: [createdAction, readAction] } },
            orderBy: { created_at: "desc" },
            take: 40,
            select: { id: true, action: true, entity_type: true, entity_id: true, metadata: true, created_at: true },
          }))
        : Promise.resolve([]),
    ]);

    const modernReadIds = new Set(modernReads.map((row) => row.notification_id));
    const legacyReadIds = new Set(
      readLogs
        .filter((log) => (log.metadata as Record<string, unknown> | null)?.reader_id === user.id)
        .map((log) => log.entity_id)
        .filter((id): id is string => Boolean(id)),
    );

    const modernRows = modern.map((row) => ({
      id: row.id,
      notificationId: row.id,
      created_at: row.created_at,
      read: modernReadIds.has(row.id),
      title: row.title,
      message: row.message,
      priority: row.priority,
      audience: row.audience,
      author_name: row.author_name,
      source: "table" as const,
    }));

    const modernIds = new Set(modernRows.map((row) => row.id));
    const legacyRows = notifications
      .filter((row) => !isModernStorageMirror(row.metadata, "AppNotification", modernIds, row.entity_id) && !modernIds.has(row.id))
      .map((row) => ({
        id: row.id,
        notificationId: row.entity_id || row.id,
        created_at: row.created_at,
        read: legacyReadIds.has(row.entity_id || row.id) || modernReadIds.has(row.entity_id || row.id),
        ...(row.metadata as Record<string, unknown>),
        source: "legacy" as const,
      }));

    return NextResponse.json({
      notifications: mergeByCreatedAt(modernRows, legacyRows, 100, {
        modernStorage: "AppNotification",
        legacyEntityId: (row) => row.notificationId,
        legacyStorage: (row) => {
          const storage = (row as { storage?: unknown }).storage;
          return typeof storage === "string" ? storage : null;
        },
      }),
      recentEvents: includeAudit
        ? recentEventsRaw.map((row) => ({
            id: row.id,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            created_at: row.created_at,
            metadata: row.metadata,
          }))
        : [],
      permissions: {
        canManage: canViewOperations(user.role),
      },
    });
  } catch (error) {
    logger.error("Get notifications error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const priority = ["normal", "important", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";
    const audience = String(body.audience || "Alla användare").trim();

    if (!title || !message) return NextResponse.json({ error: "Rubrik och meddelande krävs" }, { status: 400 });
    if (title.length > 120 || message.length > 2000) return NextResponse.json({ error: "Meddelandet är för långt" }, { status: 400 });

    const notification = await db.appNotification.create({
      data: {
        company_id: user.company_id,
        title,
        message,
        priority,
        audience,
        author_name: user.name || user.email,
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "notification",
      entityId: notification.id,
      action: createdAction,
      metadata: { title, message, priority, audience, author_name: user.name || user.email, storage: "AppNotification" },
    });

    return NextResponse.json({ success: true, notificationId: notification.id }, { status: 201 });
  } catch (error) {
    logger.error("Create notification error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const body = await request.json();
    const notificationId = String(body.notificationId || "").trim();
    if (!notificationId) return NextResponse.json({ error: "Notis-id krävs" }, { status: 400 });

    if (user.company_id) {
      const modern = await db.appNotification.findFirst({
        where: { id: notificationId, company_id: user.company_id },
        select: { id: true, deleted_at: true },
      });
      if (modern) {
        if (modern.deleted_at) {
          return NextResponse.json({ error: "Notisen hittades inte" }, { status: 404 });
        }
        await db.notificationRead.upsert({
          where: { notification_id_reader_user_id: { notification_id: modern.id, reader_user_id: user.id } },
          create: {
            company_id: user.company_id,
            notification_id: modern.id,
            reader_user_id: user.id,
          },
          update: { read_at: new Date() },
        });
        return NextResponse.json({ success: true });
      }
    }

    const legacyNotification = await db.auditLog.findFirst({
      where: { ...scopeFor(user), action: createdAction, entity_id: notificationId },
      select: { id: true, metadata: true },
    });
    const legacyMetadata = (legacyNotification?.metadata || {}) as Record<string, unknown>;
    if (legacyNotification && legacyMetadata.storage !== "AppNotification") {
      return NextResponse.json({
        error: "Notisen finns kvar i äldre lagring. Kör backfill till AppNotification innan den kan markeras som läst.",
      }, { status: 409 });
    }

    return NextResponse.json({ error: "Notisen hittades inte" }, { status: 404 });
  } catch (error) {
    logger.error("Mark notification read error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const notificationId = String(body.notificationId || body.id || "").trim();
    if (!notificationId) return NextResponse.json({ error: "Notis-id krävs" }, { status: 400 });

    const modern = await db.appNotification.findFirst({
      where: { id: notificationId, company_id: user.company_id, deleted_at: null },
      select: { id: true, title: true },
    });
    if (!modern) {
      const legacy = await db.auditLog.findFirst({
        where: { ...scopeFor(user), action: createdAction, entity_id: notificationId },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "AppNotification") {
        return NextResponse.json({
          error: "Notisen finns kvar i äldre lagring. Kör backfill till AppNotification innan den kan tas bort.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Notisen hittades inte" }, { status: 404 });
    }

    const deleted = await db.appNotification.updateMany({
      where: { id: modern.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleted.count === 0) return NextResponse.json({ error: "Notisen hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "notification",
      entityId: modern.id,
      action: "notification.deleted",
      metadata: { title: modern.title, softDelete: true, storage: "AppNotification" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete notification error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
