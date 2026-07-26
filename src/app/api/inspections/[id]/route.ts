import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { auditScopedWhere, canManageTickets, getCurrentUser } from "@/lib/current-user";

const allowedStatuses = new Set(["planned", "booked", "completed", "action_required", "cancelled"]);
const allowedTypes = new Set([
  "ovk",
  "sba",
  "elevator",
  "energy",
  "radon",
  "pressure",
  "playground",
  "electrical",
  "other",
]);

function parseDueDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
    const inspection = await db.complianceInspection.findFirst({
      where: { id, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        due_date: true,
        responsible: true,
        supplier: true,
        interval_months: true,
        note: true,
      },
    });
    if (!inspection) {
      const orphaned = await db.complianceInspection.findFirst({
        where: { id, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: "inspection.created", id },
        select: { id: true, metadata: true },
      });
      const metadata = (legacy?.metadata || {}) as Record<string, unknown>;
      if (legacy && metadata.storage !== "ComplianceInspection") {
        return NextResponse.json({
          error: "Kontrollen finns kvar i äldre lagring. Kör backfill till ComplianceInspection innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    const fieldKeys = ["title", "type", "dueDate", "responsible", "supplier", "intervalMonths", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const data: {
      status?: string;
      title?: string;
      type?: string;
      due_date?: Date;
      responsible?: string | null;
      supplier?: string | null;
      interval_months?: number;
      note?: string | null;
    } = {};

    if (hasStatus) data.status = status;

    if (body.title !== undefined) {
      const title = String(body.title || "").trim();
      if (!title || title.length > 200) {
        return NextResponse.json({ error: "Titel krävs och får vara max 200 tecken" }, { status: 400 });
      }
      data.title = title;
    }
    if (body.type !== undefined) {
      const type = String(body.type || "").trim();
      if (!allowedTypes.has(type)) {
        return NextResponse.json({ error: "Ogiltig kontrolltyp" }, { status: 400 });
      }
      data.type = type;
    }
    if (body.dueDate !== undefined) {
      const raw = String(body.dueDate || "").trim();
      const due = parseDueDate(raw);
      if (!due) return NextResponse.json({ error: "Ogiltigt förfallodatum" }, { status: 400 });
      data.due_date = due;
    }
    if (body.responsible !== undefined) {
      const responsible = String(body.responsible || "").trim();
      if (responsible.length > 160) {
        return NextResponse.json({ error: "Ansvarig är för lång" }, { status: 400 });
      }
      data.responsible = responsible || null;
    }
    if (body.supplier !== undefined) {
      const supplier = String(body.supplier || "").trim();
      if (supplier.length > 160) {
        return NextResponse.json({ error: "Leverantören är för lång" }, { status: 400 });
      }
      data.supplier = supplier || null;
    }
    if (body.intervalMonths !== undefined) {
      const interval = Number(body.intervalMonths);
      if (!Number.isInteger(interval) || interval < 0 || interval > 600) {
        return NextResponse.json({ error: "Intervall måste vara 0–600 månader" }, { status: 400 });
      }
      data.interval_months = interval;
    }
    if (body.note !== undefined) {
      const note = String(body.note || "").trim();
      if (note.length > 2000) {
        return NextResponse.json({ error: "Anteckningen är för lång" }, { status: 400 });
      }
      data.note = note || null;
    }

    const updateResult = await db.complianceInspection.updateMany({
      where: { id: inspection.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Kontrollen hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "compliance_inspection",
      entityId: inspection.id,
      action: hasStatus && !hasFieldUpdate ? "inspection.status_updated" : "inspection.updated",
      metadata: {
        title: data.title ?? inspection.title,
        previousStatus: inspection.status,
        status: data.status ?? inspection.status,
        storage: "ComplianceInspection",
      },
    });

    return NextResponse.json({
      success: true,
      id: inspection.id,
      status: data.status ?? inspection.status,
    });
  } catch (error) {
    console.error("Patch inspection error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
