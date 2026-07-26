import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";

const allowedStatuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const allowedRisks = new Set(["low", "medium", "high"]);

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseMoney(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [projects, properties, members] = await Promise.all([
      db.project.findMany({
        where: { company_id: user.company_id, deleted_at: null, property: { deleted_at: null } },
        orderBy: [{ status: "asc" }, { start_date: "asc" }, { created_at: "desc" }],
        take: 500,
        include: {
          property: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true, email: true } },
          source_work_order: { select: { id: true, title: true, status: true } },
        },
      }),
      db.property.findMany({
        where: { company_id: user.company_id, deleted_at: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.user.findMany({
        where: { company_id: user.company_id, status: "active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
    ]);

    return NextResponse.json({
      projects: projects.map((project) => ({
        ...project,
        property_name: project.property.name,
        project_manager: project.manager?.name || project.manager?.email || "",
        start_date: project.start_date,
        end_date: project.end_date,
        budget: Number(project.budget),
        forecast: Number(project.forecast),
        actual: Number(project.actual),
        deviation: Number(project.forecast) - Number(project.budget),
      })),
      properties,
      members,
    });
  } catch (error) {
    console.error("Get projects error:", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json();
  const propertyId = String(body.propertyId || "").trim();
  const sourceWorkOrderId = body.sourceWorkOrderId ? String(body.sourceWorkOrderId).trim() : null;
  const managerId = body.managerId ? String(body.managerId).trim() : null;
  const name = String(body.name || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const contractor = body.contractor ? String(body.contractor).trim() : null;
  const status = String(body.status || "planned").trim();
  const risk = String(body.risk || "low").trim();
  const startDate = parseOptionalDate(body.startDate);
  const endDate = parseOptionalDate(body.endDate);
  const budget = parseMoney(body.budget);
  const forecast = parseMoney(body.forecast);
  const actual = parseMoney(body.actual);

  if (!propertyId || !name) return NextResponse.json({ error: "Fastighet och projektnamn krävs" }, { status: 400 });
  if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Ogiltig projektstatus" }, { status: 400 });
  if (!allowedRisks.has(risk)) return NextResponse.json({ error: "Ogiltig risknivå" }, { status: 400 });
  if ([budget, forecast, actual].some((value) => value === undefined)) {
    return NextResponse.json({ error: "Kontrollera ekonomiska belopp" }, { status: 400 });
  }
  if (startDate === undefined || endDate === undefined) return NextResponse.json({ error: "Kontrollera projektets datum" }, { status: 400 });
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });

  const property = await db.property.findFirst({
    where: { id: propertyId, company_id: user.company_id, deleted_at: null },
    select: { id: true, name: true },
  });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  if (managerId) {
    const manager = await db.user.findFirst({
      where: { id: managerId, company_id: user.company_id, status: "active" },
      select: { id: true },
    });
    if (!manager) return NextResponse.json({ error: "Projektledaren hittades inte" }, { status: 400 });
  }

  if (sourceWorkOrderId) {
    const source = await db.workOrder.findFirst({
      where: { deleted_at: null, id: sourceWorkOrderId, company_id: user.company_id, property_id: propertyId },
      select: { id: true },
    });
    if (!source) return NextResponse.json({ error: "Arbetsordern hittades inte för vald fastighet" }, { status: 400 });
  }

  const project = await db.project.create({
    data: {
      company_id: user.company_id,
      property_id: propertyId,
      source_work_order_id: sourceWorkOrderId,
      manager_id: managerId,
      created_by_id: user.id,
      name,
      description,
      contractor,
      status,
      risk,
      start_date: startDate,
      end_date: endDate,
      budget: budget ?? 0,
      forecast: forecast ?? 0,
      actual: actual ?? 0,
      completed_at: status === "completed" ? new Date() : null,
    },
    include: {
      property: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true, email: true } },
      source_work_order: { select: { id: true, title: true, status: true } },
    },
  });

  await writeAuditLog(user, {
    entityType: "project",
    entityId: project.id,
    action: "project.created",
    metadata: {
      propertyId,
      propertyName: property.name,
      sourceWorkOrderId,
      managerId,
      status,
      risk,
      budget,
      forecast,
      actual,
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
