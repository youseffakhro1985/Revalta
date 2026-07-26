import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt, parseDateOnly } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "calendar.event";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [rows, events] = await Promise.all([
      user.company_id
        ? db.calendarEvent.findMany({
            where: { company_id: user.company_id },
            orderBy: { date: "asc" },
            take: 500,
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "asc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      entity_id: row.id,
      title: row.title,
      date: row.date.toISOString().slice(0, 10),
      time: row.time || "",
      type: row.type,
      property_name: row.property_name || "",
      responsible: row.responsible || "",
      note: row.note || "",
      status: row.status,
      created_at: row.created_at,
      source: "table" as const,
    }));
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = events
      .filter((event) => !isModernStorageMirror(event.metadata, "CalendarEvent", modernIds, event.entity_id) && !modernIds.has(event.id))
      .map((event) => ({
        id: event.id,
        entity_id: event.entity_id,
        ...(event.metadata as object),
        created_at: event.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      events: mergeByCreatedAt(modern, legacy, 500).sort((left, right) => {
        const leftDate = String((left as { date?: string }).date || "");
        const rightDate = String((right as { date?: string }).date || "");
        return leftDate.localeCompare(rightDate);
      }),
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
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const title = String(body.title || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const type = String(body.type || "Aktivitet").trim();
    const propertyName = String(body.propertyName || "").trim();
    const responsible = String(body.responsible || "").trim();
    const note = String(body.note || "").trim();
    const parsedDate = parseDateOnly(date);

    if (!title || !parsedDate) {
      return NextResponse.json({ error: "Titel och giltigt datum krävs" }, { status: 400 });
    }

    const event = await db.calendarEvent.create({
      data: {
        company_id: user.company_id,
        title,
        date: parsedDate,
        time: time || null,
        type,
        property_name: propertyName || null,
        responsible: responsible || null,
        note: note || null,
        status: "planned",
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "calendar_event",
      entityId: event.id,
      action,
      metadata: {
        title,
        date,
        time,
        type,
        property_name: propertyName,
        responsible,
        note,
        status: "planned",
        storage: "CalendarEvent",
      },
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    console.error("Create calendar event error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

const allowedStatuses = new Set(["planned", "done", "cancelled"]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const eventId = String(body.eventId || body.id || "").trim();
    const status = String(body.status || "").trim();
    if (!eventId || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Aktivitets-id och giltig status krävs" }, { status: 400 });
    }

    const existing = await db.calendarEvent.findFirst({
      where: { id: eventId, company_id: user.company_id },
      select: { id: true, title: true, status: true },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: eventId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Aktiviteten finns kvar i äldre lagring. Kör backfill till CalendarEvent innan status ändras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    if (existing.status === status) return NextResponse.json({ success: true, id: existing.id, status });

    const updateResult = await db.calendarEvent.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data: { status },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "calendar_event",
      entityId: existing.id,
      action: "calendar.event.status_updated",
      metadata: {
        title: existing.title,
        previousStatus: existing.status,
        status,
        storage: "CalendarEvent",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, status });
  } catch (error) {
    console.error("Update calendar event status error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
