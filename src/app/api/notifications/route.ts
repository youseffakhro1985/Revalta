import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

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
    const [notifications, readLogs, recentEvents] = await Promise.all([
      db.auditLog.findMany({
        where: { ...scope, action: createdAction },
        orderBy: { created_at: "desc" },
        take: 100,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.auditLog.findMany({
        where: { ...scope, action: readAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { entity_id: true, metadata: true },
      }),
      db.auditLog.findMany({
        where: { ...scope, action: { notIn: [createdAction, readAction] } },
        orderBy: { created_at: "desc" },
        take: 40,
        select: { id: true, action: true, entity_type: true, entity_id: true, metadata: true, created_at: true },
      }),
    ]);

    const readIds = new Set(
      readLogs
        .filter((log) => (log.metadata as Record<string, unknown> | null)?.reader_id === user.id)
        .map((log) => log.entity_id)
        .filter((id): id is string => Boolean(id))
    );

    return NextResponse.json({
      notifications: notifications.map((row) => ({
        id: row.id,
        notificationId: row.entity_id || row.id,
        created_at: row.created_at,
        read: readIds.has(row.entity_id || row.id),
        ...(row.metadata as Record<string, unknown>),
      })),
      recentEvents: recentEvents.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        created_at: row.created_at,
        metadata: row.metadata,
      })),
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = await request.json();
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const priority = ["normal", "important", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";
    const audience = String(body.audience || "Alla användare").trim();

    if (!title || !message) return NextResponse.json({ error: "Rubrik och meddelande krävs" }, { status: 400 });
    if (title.length > 120 || message.length > 2000) return NextResponse.json({ error: "Meddelandet är för långt" }, { status: 400 });

    const notificationId = crypto.randomUUID();
    await writeAuditLog(user, {
      entityType: "notification",
      entityId: notificationId,
      action: createdAction,
      metadata: { title, message, priority, audience, author_name: user.name || user.email },
    });

    return NextResponse.json({ success: true, notificationId }, { status: 201 });
  } catch (error) {
    console.error("Create notification error:", error);
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

    const notification = await db.auditLog.findFirst({
      where: { ...scopeFor(user), action: createdAction, entity_id: notificationId },
      select: { id: true },
    });
    if (!notification) return NextResponse.json({ error: "Notisen hittades inte" }, { status: 404 });

    const existing = await db.auditLog.findFirst({
      where: { ...scopeFor(user), action: readAction, entity_id: notificationId },
      select: { metadata: true },
    });
    const existingReader = (existing?.metadata as Record<string, unknown> | null)?.reader_id;
    if (existingReader !== user.id) {
      await writeAuditLog(user, {
        entityType: "notification",
        entityId: notificationId,
        action: readAction,
        metadata: { reader_id: user.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
