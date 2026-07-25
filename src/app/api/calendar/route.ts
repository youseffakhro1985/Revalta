import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "calendar.event";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const events = await db.auditLog.findMany({
      where: { ...auditScopedWhere(user), action },
      orderBy: { created_at: "asc" },
      take: 500,
      select: { id: true, entity_id: true, metadata: true, created_at: true },
    });

    return NextResponse.json({
      events: events.map((event) => ({ id: event.id, entity_id: event.entity_id, ...(event.metadata as object), created_at: event.created_at })),
    });
  } catch (error) {
    console.error("Get calendar events error:", error);
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
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const type = String(body.type || "Aktivitet").trim();
    const propertyName = String(body.propertyName || "").trim();
    const responsible = String(body.responsible || "").trim();
    const note = String(body.note || "").trim();

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Titel och giltigt datum krävs" }, { status: 400 });
    }

    await writeAuditLog(user, {
      entityType: "calendar_event",
      entityId: crypto.randomUUID(),
      action,
      metadata: { title, date, time, type, property_name: propertyName, responsible, note, status: "planned" },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create calendar event error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
