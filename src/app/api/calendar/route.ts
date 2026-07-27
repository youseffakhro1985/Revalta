import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt, parseDateOnly, loadLegacyRows } from "@/lib/dual-list";
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
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "asc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
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
    if (!eventId) return NextResponse.json({ error: "Aktivitets-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const fieldKeys = ["title", "date", "time", "responsible", "note", "propertyName", "type"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const existing = await db.calendarEvent.findFirst({
      where: { id: eventId, company_id: user.company_id },
      select: {
        id: true,
        title: true,
        status: true,
        date: true,
        time: true,
        type: true,
        property_name: true,
        responsible: true,
        note: true,
      },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: eventId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Aktiviteten finns kvar i äldre lagring. Kör backfill till CalendarEvent innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    const nextStatus = hasStatus ? status : existing.status;
    let title = existing.title;
    let date = existing.date;
    let time = existing.time || "";
    let type = existing.type;
    let propertyName = existing.property_name || "";
    let responsible = existing.responsible || "";
    let note = existing.note || "";

    if (hasFieldUpdate) {
      if (body.title !== undefined) title = String(body.title || "").trim();
      if (body.date !== undefined) {
        const parsedDate = parseDateOnly(String(body.date || "").trim());
        if (!parsedDate) return NextResponse.json({ error: "Ogiltigt datum" }, { status: 400 });
        date = parsedDate;
      }
      if (body.time !== undefined) time = String(body.time || "").trim();
      if (body.type !== undefined) type = String(body.type || "Aktivitet").trim() || "Aktivitet";
      if (body.propertyName !== undefined) propertyName = String(body.propertyName || "").trim();
      if (body.responsible !== undefined) responsible = String(body.responsible || "").trim();
      if (body.note !== undefined) note = String(body.note || "").trim();
      if (!title) return NextResponse.json({ error: "Titel krävs" }, { status: 400 });
    }

    const statusOnly = hasStatus && !hasFieldUpdate;
    if (statusOnly && existing.status === nextStatus) {
      return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
    }

    const data = hasFieldUpdate
      ? {
          status: nextStatus,
          title,
          date,
          time: time || null,
          type,
          property_name: propertyName || null,
          responsible: responsible || null,
          note: note || null,
        }
      : { status: nextStatus };

    const updateResult = await db.calendarEvent.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "calendar_event",
      entityId: existing.id,
      action: statusOnly ? "calendar.event.status_updated" : "calendar.event.updated",
      metadata: {
        title,
        previousStatus: existing.status,
        status: nextStatus,
        date: date.toISOString().slice(0, 10),
        time,
        responsible,
        note,
        storage: "CalendarEvent",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
  } catch (error) {
    console.error("Update calendar event error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const eventId = String(body.eventId || body.id || "").trim();
    if (!eventId) return NextResponse.json({ error: "Aktivitets-id krävs" }, { status: 400 });

    const existing = await db.calendarEvent.findFirst({
      where: { id: eventId, company_id: user.company_id },
      select: { id: true, title: true, date: true, status: true },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: eventId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Aktiviteten finns kvar i äldre lagring. Kör backfill till CalendarEvent innan den kan tas bort.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    const deleteResult = await db.calendarEvent.deleteMany({
      where: { id: existing.id, company_id: user.company_id },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Aktiviteten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "calendar_event",
      entityId: existing.id,
      action: "calendar.event.deleted",
      metadata: {
        title: existing.title,
        date: existing.date.toISOString().slice(0, 10),
        status: existing.status,
        storage: "CalendarEvent",
      },
    });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Delete calendar event error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
