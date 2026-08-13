import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { countDeviations, normalizeChecklist, parseChecklistUpdate } from "@/lib/inspection-round-checklist";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/rounds/[id]" });

const ALLOWED_INTERVALS = new Set(["weekly", "monthly", "quarterly", "yearly"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Ogiltigt underlag" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const hasChecklist = Array.isArray(payload.checklist);
    const hasFields =
      payload.title !== undefined ||
      payload.interval !== undefined ||
      payload.nextDue !== undefined;
    if (!hasChecklist && !hasFields) {
      return NextResponse.json({ error: "Kontrollpunkter eller fält att uppdatera krävs" }, { status: 400 });
    }

    const round = await db.inspectionRound.findFirst({
      where: { id, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        title: true,
        checklist: true,
        status: true,
        interval: true,
        next_due: true,
      },
    });
    if (!round) {
      const orphaned = await db.inspectionRound.findFirst({
        where: { id, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), entity_type: "round", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "InspectionRound") {
        return NextResponse.json({
          error: "Ronden finns kvar i äldre lagring. Kör backfill till InspectionRound innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });
    }

    const data: {
      title?: string;
      interval?: string;
      next_due?: Date;
      checklist?: Prisma.InputJsonValue;
      deviations?: number;
      status?: string;
    } = {};

    let title = round.title;
    let interval = round.interval;
    let nextDue = round.next_due;
    let status = round.status;
    let checklist = normalizeChecklist(round.checklist);
    let deviations = countDeviations(checklist);

    if (hasFields) {
      if (payload.title !== undefined) {
        const nextTitle = typeof payload.title === "string" ? payload.title.trim() : "";
        if (!nextTitle || nextTitle.length > 200) {
          return NextResponse.json({ error: "Titel krävs och får vara max 200 tecken" }, { status: 400 });
        }
        title = nextTitle;
        data.title = nextTitle;
      }
      if (payload.interval !== undefined) {
        const nextInterval = typeof payload.interval === "string" ? payload.interval.trim() : "";
        if (!ALLOWED_INTERVALS.has(nextInterval)) {
          return NextResponse.json({ error: "Ogiltigt intervall" }, { status: 400 });
        }
        interval = nextInterval;
        data.interval = nextInterval;
      }
      if (payload.nextDue !== undefined) {
        const raw = typeof payload.nextDue === "string" ? payload.nextDue.trim() : "";
        const parsedDate = raw ? new Date(raw) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json({ error: "Ogiltigt nästa datum" }, { status: 400 });
        }
        nextDue = parsedDate;
        data.next_due = parsedDate;
      }
    }

    if (hasChecklist) {
      const previous = normalizeChecklist(round.checklist);
      const parsed = parseChecklistUpdate(payload, previous);
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
      checklist = parsed.data.checklist;
      deviations = countDeviations(checklist);
      status =
        parsed.data.status ||
        (checklist.every((item) => item.completed || item.hasDeviation) ? "completed" : "in_progress");
      data.checklist = checklist as unknown as Prisma.InputJsonValue;
      data.deviations = deviations;
      data.status = status;
    }

    const updated = await db.inspectionRound.updateMany({
      where: { id: round.id, company_id: user.company_id },
      data,
    });
    if (updated.count === 0) return NextResponse.json({ error: "Ronden hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "round",
      entityId: round.id,
      action: hasChecklist ? "round.updated" : "round.fields_updated",
      metadata: {
        title,
        previousStatus: round.status,
        status,
        interval,
        nextDue: nextDue.toISOString(),
        deviations,
        completedCount: checklist.filter((item) => item.completed).length,
        storage: "InspectionRound",
      },
    });

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        title,
        interval,
        nextDue: nextDue.toISOString(),
        status,
        deviations,
        checklist,
      },
    });
  } catch (error) {
    logger.error("Update round error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
