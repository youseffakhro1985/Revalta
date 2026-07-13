import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const allowedStatuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const allowedRisks = new Set(["low", "medium", "high"]);

function parseOptionalDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseOptionalMoney(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const existing = await db.project.findFirst({
    where: { id, company_id: user.company_id },
    select: { id: true, status: true, property_id: true },
  });
  if (!existing) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });

  const body = await request.json();
  const data: Prisma.ProjectUncheckedUpdateInput = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Projektnamn får inte vara tomt" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (body.contractor !== undefined) data.contractor = body.contractor ? String(body.contractor).trim() : null;

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Ogiltig projektstatus" }, { status: 400 });
    data.status = status;
    data.completed_at = status === "completed" ? new Date() : null;
  }
  if (body.risk !== undefined) {
    const risk = String(body.risk);
    if (!allowedRisks.has(risk)) return NextResponse.json({ error: "Ogiltig risknivå" }, { status: 400 });
    data.risk = risk;
  }

  if (body.managerId !== undefined) {
    const managerId = body.managerId ? String(body.managerId).trim() : null;
    if (managerId) {
      const manager = await db.user.findFirst({
        where: { id: managerId, company_id: user.company_id, status: "active" },
        select: { id: true },
      });
      if (!manager) return NextResponse.json({ error: "Projektledaren hittades inte" }, { status: 400 });
    }
    data.manager_id = managerId;
  }

  if (body.startDate !== undefined) {
    const value = parseOptionalDate(body.startDate);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
    data.start_date = value;
  }
  if (body.endDate !== undefined) {
    const value = parseOptionalDate(body.endDate);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
    data.end_date = value;
  }

  const startDate = data.start_date instanceof Date ? data.start_date : null;
  const endDate = data.end_date instanceof Date ? data.end_date : null;
  if (startDate && endDate && endDate < startDate) {
    return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });
  }

  for (const [bodyKey, dataKey, label] of [
    ["budget", "budget", "budget"],
    ["forecast", "forecast", "prognos"],
    ["actual", "actual", "utfall"],
  ] as const) {
    if (body[bodyKey] !== undefined) {
      const value = parseOptionalMoney(body[bodyKey]);
      if (value === undefined) return NextResponse.json({ error: `Ogiltigt ${label}` }, { status: 400 });
      data[dataKey] = value ?? 0;
    }
  }

  const project = await db.project.update({
    where: { id: existing.id },
    data,
    include: {
      property: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true, email: true } },
      source_work_order: { select: { id: true, title: true, status: true } },
    },
  });

  await writeAuditLog(user, {
    entityType: "project",
    entityId: project.id,
    action: "project.updated",
    metadata: {
      previousStatus: existing.status,
      status: project.status,
      managerId: project.manager_id,
      budget: project.budget.toString(),
      forecast: project.forecast.toString(),
      actual: project.actual.toString(),
      deviation: (Number(project.forecast) - Number(project.budget)).toString(),
    },
  });

  return NextResponse.json({ project });
}
