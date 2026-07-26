import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber } from "@/lib/dual-list";

const allowedTypes = new Set(["time", "cost", "checklist", "note"]);

function mapModernOperation(row: {
  id: string;
  operation_type: string;
  description: string | null;
  minutes: number | null;
  amount: { toString(): string } | number | null;
  completed: boolean | null;
  ticket_title: string | null;
  created_at: Date;
  created_by: { name: string | null; email: string };
}) {
  return {
    id: row.id,
    action: `workorder.${row.operation_type}.added`,
    metadata: {
      type: row.operation_type,
      description: row.description,
      minutes: row.minutes,
      amount: row.amount === null ? null : asNumber(row.amount),
      completed: row.completed,
      ticketTitle: row.ticket_title,
      storage: "TicketOperation",
    },
    created_at: row.created_at,
    actor: row.created_by,
    source: "table" as const,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
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
      select: { id: true, company_id: true },
    });

    if (!ticket) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

    const [rows, logs] = await Promise.all([
      user.company_id
        ? db.ticketOperation.findMany({
            where: { company_id: user.company_id, ticket_id: ticket.id },
            orderBy: { created_at: "desc" },
            take: 100,
            include: { created_by: { select: { name: true, email: true } } },
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: {
          ...(user.company_id ? { company_id: user.company_id } : { actor_user_id: user.id }),
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
      }),
    ]);

    const modern = rows.map(mapModernOperation);
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = logs
      .filter((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        if (metadata.storage === "TicketOperation") return false;
        if (modernIds.has(log.id)) return false;
        if (typeof metadata.operationId === "string" && modernIds.has(metadata.operationId)) return false;
        return true;
      })
      .map((log) => ({
        id: log.id,
        action: log.action,
        metadata: log.metadata,
        created_at: log.created_at,
        actor: log.actor,
        source: "legacy" as const,
      }));

    const operations = [...modern, ...legacy]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 100);

    return NextResponse.json({ operations });
  } catch (error) {
    console.error("Get work order operations error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

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

    const operation = await db.ticketOperation.create({
      data: {
        company_id: user.company_id,
        ticket_id: ticket.id,
        operation_type: type,
        description: description || null,
        minutes: type === "time" ? Math.round(minutes) : null,
        amount: type === "cost" ? Math.round(amount * 100) / 100 : null,
        completed: type === "checklist" ? completed : null,
        ticket_title: ticket.title,
        created_by_id: user.id,
      },
      include: { created_by: { select: { name: true, email: true } } },
    });

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: `workorder.${type}.added`,
      metadata: {
        operationId: operation.id,
        type,
        description: description || null,
        minutes: type === "time" ? Math.round(minutes) : null,
        amount: type === "cost" ? Math.round(amount * 100) / 100 : null,
        completed: type === "checklist" ? completed : null,
        ticketTitle: ticket.title,
        storage: "TicketOperation",
      },
    });

    return NextResponse.json({ success: true, operation: mapModernOperation(operation) }, { status: 201 });
  } catch (error) {
    console.error("Create work order operation error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
