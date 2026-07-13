import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const allowedTypes = new Set(["time", "cost", "checklist", "note"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }

    const { id } = await params;
    const ticket = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: { id: true },
    });

    if (!ticket) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

    const operations = await db.auditLog.findMany({
      where: {
        entity_type: "ticket",
        entity_id: id,
        action: { startsWith: "workorder." },
      },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
        actor: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ operations });
  } catch (error) {
    console.error("Get work order operations error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }

    const { id } = await params;
    const ticket = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: { id: true, title: true },
    });
    if (!ticket) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

    const body = await request.json();
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!allowedTypes.has(type)) {
      return NextResponse.json({ error: "Ogiltig registreringstyp" }, { status: 400 });
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    const minutes = Number(body.minutes || 0);
    const amount = Number(body.amount || 0);
    const completed = Boolean(body.completed);

    if (type === "time" && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)) {
      return NextResponse.json({ error: "Ange giltig arbetstid i minuter" }, { status: 400 });
    }
    if (type === "cost" && (!Number.isFinite(amount) || amount < 0 || amount > 10000000)) {
      return NextResponse.json({ error: "Ange ett giltigt kostnadsbelopp" }, { status: 400 });
    }
    if ((type === "checklist" || type === "note") && description.length < 2) {
      return NextResponse.json({ error: "Beskrivningen är för kort" }, { status: 400 });
    }

    const metadata = {
      type,
      description: description || null,
      minutes: type === "time" ? Math.round(minutes) : null,
      amount: type === "cost" ? Math.round(amount * 100) / 100 : null,
      completed: type === "checklist" ? completed : null,
      ticketTitle: ticket.title,
    };

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: `workorder.${type}.added`,
      metadata,
    });

    const operation = await db.auditLog.findFirst({
      where: {
        entity_type: "ticket",
        entity_id: ticket.id,
        action: `workorder.${type}.added`,
        actor_user_id: user.id,
      },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
        actor: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, operation }, { status: 201 });
  } catch (error) {
    console.error("Create work order operation error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
