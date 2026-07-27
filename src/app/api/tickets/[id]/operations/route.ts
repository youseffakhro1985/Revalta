import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, loadLegacyRows } from "@/lib/dual-list";

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
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true, company_id: true },
    });

    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });

    const [rows, logs] = await Promise.all([
      user.company_id
        ? db.ticketOperation.findMany({
            where: { company_id: user.company_id, ticket_id: ticket.id, deleted_at: null },
            orderBy: { created_at: "desc" },
            take: 100,
            include: { created_by: { select: { name: true, email: true } } },
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
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
      })),
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
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true, title: true },
    });
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });

    const body = await request.json();
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!allowedTypes.has(type)) {
      return NextResponse.json({ error: "Ogiltig registreringstyp" }, { status: 400 });
    }

    if (type === "time" || type === "cost") {
      const linkedWorkOrder = await db.workOrder.findFirst({
        where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
        select: { id: true },
      });
      if (linkedWorkOrder) {
        return NextResponse.json({
          error: "Ärendet har en arbetsorder. Registrera tid och kostnad under Ekonomi och fakturering på arbetsordern.",
          workOrderId: linkedWorkOrder.id,
        }, { status: 409 });
      }
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

export async function PATCH(
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
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });

    const operationId = String(body.operationId || body.id || "").trim();
    if (!operationId) return NextResponse.json({ error: "Registrerings-id krävs" }, { status: 400 });

    const fieldKeys = ["description", "minutes", "amount", "completed"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasFieldUpdate) {
      return NextResponse.json({ error: "Ange minst ett fält att uppdatera" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true, title: true },
    });
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });

    const existing = await db.ticketOperation.findFirst({
      where: {
        id: operationId,
        company_id: user.company_id,
        ticket_id: ticket.id,
        deleted_at: null,
      },
      select: {
        id: true,
        operation_type: true,
        description: true,
        minutes: true,
        amount: true,
        completed: true,
        ticket_title: true,
        created_at: true,
        created_by: { select: { name: true, email: true } },
      },
    });
    if (!existing) {
      const legacy = await db.auditLog.findFirst({
        where: {
          ...(user.company_id ? { company_id: user.company_id } : { actor_user_id: user.id }),
          entity_type: "ticket",
          entity_id: ticket.id,
          id: operationId,
          action: { startsWith: "workorder." },
        },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "TicketOperation") {
        return NextResponse.json({
          error: "Registreringen finns kvar i äldre lagring. Kör backfill till TicketOperation innan den kan ändras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Registreringen hittades inte" }, { status: 404 });
    }

    const type = existing.operation_type;
    const data: {
      description?: string | null;
      minutes?: number | null;
      amount?: number | null;
      completed?: boolean | null;
    } = {};

    if (body.description !== undefined) {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if ((type === "checklist" || type === "note") && description.length < 2) {
        return NextResponse.json({ error: "Beskrivningen är för kort" }, { status: 400 });
      }
      if (description.length > 2000) {
        return NextResponse.json({ error: "Beskrivningen är för lång" }, { status: 400 });
      }
      data.description = description || null;
    }

    if (body.minutes !== undefined) {
      if (type !== "time") {
        return NextResponse.json({ error: "Minuter kan bara ändras på tidsregistreringar" }, { status: 400 });
      }
      const minutes = Number(body.minutes);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
        return NextResponse.json({ error: "Ange giltig arbetstid i minuter" }, { status: 400 });
      }
      data.minutes = Math.round(minutes);
    }

    if (body.amount !== undefined) {
      if (type !== "cost") {
        return NextResponse.json({ error: "Belopp kan bara ändras på kostnadsregistreringar" }, { status: 400 });
      }
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
        return NextResponse.json({ error: "Ange ett giltigt kostnadsbelopp" }, { status: 400 });
      }
      data.amount = Math.round(amount * 100) / 100;
    }

    if (body.completed !== undefined) {
      if (type !== "checklist") {
        return NextResponse.json({ error: "Klar-status kan bara ändras på checklistor" }, { status: 400 });
      }
      data.completed = Boolean(body.completed);
    }

    const updated = await db.ticketOperation.updateMany({
      where: {
        id: existing.id,
        company_id: user.company_id,
        ticket_id: ticket.id,
        deleted_at: null,
      },
      data,
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: "Registreringen kunde inte uppdateras. Ladda om och försök igen." }, { status: 409 });
    }

    const operation = await db.ticketOperation.findFirst({
      where: { id: existing.id, company_id: user.company_id, ticket_id: ticket.id, deleted_at: null },
      include: { created_by: { select: { name: true, email: true } } },
    });
    if (!operation) {
      return NextResponse.json({ error: "Registreringen hittades inte efter uppdatering" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "workorder.operation.updated",
      metadata: {
        operationId: existing.id,
        type,
        description: operation.description,
        minutes: operation.minutes,
        amount: operation.amount === null ? null : asNumber(operation.amount),
        completed: operation.completed,
        ticketTitle: ticket.title,
        storage: "TicketOperation",
      },
    });

    return NextResponse.json({ success: true, operation: mapModernOperation(operation) });
  } catch (error) {
    console.error("Update ticket operation error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(
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
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const operationId = String(body.operationId || body.id || "").trim();
    if (!operationId) return NextResponse.json({ error: "Registrerings-id krävs" }, { status: 400 });

    const ticket = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true },
    });
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });

    const existing = await db.ticketOperation.findFirst({
      where: {
        id: operationId,
        company_id: user.company_id,
        ticket_id: ticket.id,
        deleted_at: null,
      },
      select: { id: true, operation_type: true },
    });
    if (!existing) {
      const alreadyDeleted = await db.ticketOperation.findFirst({
        where: { id: operationId, company_id: user.company_id, ticket_id: ticket.id },
        select: { id: true, deleted_at: true },
      });
      if (alreadyDeleted?.deleted_at) {
        return NextResponse.json({ error: "Registreringen är redan borttagen" }, { status: 409 });
      }
      const legacy = await db.auditLog.findFirst({
        where: {
          ...(user.company_id ? { company_id: user.company_id } : { actor_user_id: user.id }),
          entity_type: "ticket",
          entity_id: ticket.id,
          id: operationId,
          action: { startsWith: "workorder." },
        },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "TicketOperation") {
        return NextResponse.json({
          error: "Registreringen finns kvar i äldre lagring. Kör backfill till TicketOperation innan den kan tas bort.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Registreringen hittades inte" }, { status: 404 });
    }

    const now = new Date();
    const updated = await db.ticketOperation.updateMany({
      where: {
        id: existing.id,
        company_id: user.company_id,
        ticket_id: ticket.id,
        deleted_at: null,
      },
      data: { deleted_at: now },
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: "Registreringen kunde inte tas bort. Ladda om och försök igen." }, { status: 409 });
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "workorder.operation.deleted",
      metadata: {
        operationId: existing.id,
        type: existing.operation_type,
        storage: "TicketOperation",
      },
    });

    return NextResponse.json({ success: true, id: existing.id, deleted_at: now.toISOString() });
  } catch (error) {
    console.error("Delete ticket operation error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
