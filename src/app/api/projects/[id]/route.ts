import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { canManageWorkOrderFinance, canViewFinanceData, canViewOperations, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const allowedStatuses = new Set(["planned", "active", "paused", "completed", "cancelled"]);
const allowedRisks = new Set(["low", "medium", "high"]);

class ProjectMutationConflict extends Error {
  constructor() {
    super("Projektet ändrades under uppdateringen");
    this.name = "ProjectMutationConflict";
  }
}

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewOperations(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa projekt" }, { status: 403 });
  }

  const { id } = await params;
  const project = await db.project.findFirst({
    where: { id, company_id: user.company_id, deleted_at: null, property: { deleted_at: null } },
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      manager: { select: { id: true, name: true, email: true } },
      created_by: { select: { id: true, name: true, email: true } },
      source_work_order: { select: { id: true, title: true, status: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });
  const includeEconomics = canViewFinanceData(user.role);
  return NextResponse.json({
    project: includeEconomics
      ? project
      : { ...project, budget: null, forecast: null, actual: null },
    permissions: {
      canViewFinance: includeEconomics,
      canManage: canManageWorkOrderFinance(user.role),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const companyId = user.company_id;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  const { id } = await params;
  const existing = await db.project.findFirst({
    where: { id, company_id: companyId, deleted_at: null, property: { deleted_at: null } },
    select: { id: true, status: true, start_date: true, end_date: true },
  });
  if (!existing) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });

  const data: Prisma.ProjectUncheckedUpdateInput = {};
  if (body.name !== undefined) { const value = String(body.name).trim(); if (!value) return NextResponse.json({ error: "Projektnamn får inte vara tomt" }, { status: 400 }); data.name = value; }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (body.contractor !== undefined) data.contractor = body.contractor ? String(body.contractor).trim() : null;
  if (body.status !== undefined) { const value = String(body.status); if (!allowedStatuses.has(value)) return NextResponse.json({ error: "Ogiltig projektstatus" }, { status: 400 }); data.status = value; data.completed_at = value === "completed" ? new Date() : null; }
  if (body.risk !== undefined) { const value = String(body.risk); if (!allowedRisks.has(value)) return NextResponse.json({ error: "Ogiltig risknivå" }, { status: 400 }); data.risk = value; }
  if (body.managerId !== undefined) {
    const managerId = body.managerId ? String(body.managerId).trim() : null;
    if (managerId) {
      const manager = await db.user.findFirst({ where: { id: managerId, company_id: companyId, status: "active" }, select: { id: true } });
      if (!manager) return NextResponse.json({ error: "Projektledaren hittades inte" }, { status: 400 });
    }
    data.manager_id = managerId;
  }
  let nextStartDate = existing.start_date;
  let nextEndDate = existing.end_date;
  if (body.startDate !== undefined) {
    const value = parseOptionalDate(body.startDate);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
    data.start_date = value;
    nextStartDate = value;
  }
  if (body.endDate !== undefined) {
    const value = parseOptionalDate(body.endDate);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
    data.end_date = value;
    nextEndDate = value;
  }
  if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
    return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });
  }
  for (const [bodyKey, dataKey, label] of [["budget", "budget", "budget"], ["forecast", "forecast", "prognos"], ["actual", "actual", "utfall"]] as const) {
    if (body[bodyKey] !== undefined) { const value = parseOptionalMoney(body[bodyKey]); if (value === undefined) return NextResponse.json({ error: `Ogiltigt ${label}` }, { status: 400 }); data[dataKey] = value ?? 0; }
  }

  let project;
  try {
    project = await db.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: { deleted_at: null, id: existing.id, company_id: companyId },
        data,
      });
      if (updateResult.count === 0) return null;

      const updatedProject = await tx.project.findFirst({
        where: { deleted_at: null, id: existing.id, company_id: companyId },
        include: {
          property: { select: { id: true, name: true, address: true, city: true } },
          manager: { select: { id: true, name: true, email: true } },
          created_by: { select: { id: true, name: true, email: true } },
          source_work_order: { select: { id: true, title: true, status: true } },
        },
      });
      if (!updatedProject) throw new ProjectMutationConflict();

      await writeAuditLog(user, {
        entityType: "project",
        entityId: updatedProject.id,
        action: "project.updated",
        metadata: {
          previousStatus: existing.status,
          status: updatedProject.status,
          managerId: updatedProject.manager_id,
          budget: updatedProject.budget.toString(),
          forecast: updatedProject.forecast.toString(),
          actual: updatedProject.actual.toString(),
          deviation: (Number(updatedProject.forecast) - Number(updatedProject.budget)).toString(),
        },
      }, tx);

      return updatedProject;
    });
  } catch (error) {
    if (error instanceof ProjectMutationConflict) {
      return NextResponse.json({ error: "Projektet ändrades under uppdateringen. Ladda om och försök igen." }, { status: 409 });
    }
    throw error;
  }

  if (!project) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const companyId = user.company_id;

  const { id } = await params;
  const existing = await db.project.findFirst({
    where: { id, company_id: companyId, deleted_at: null, property: { deleted_at: null } },
    select: { id: true, name: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });

  const deleted = await db.$transaction(async (tx) => {
    const deleteResult = await tx.project.updateMany({
      where: { id: existing.id, company_id: companyId, deleted_at: null },
      data: { deleted_at: new Date(), status: existing.status === "completed" ? existing.status : "cancelled" },
    });
    if (deleteResult.count === 0) return false;

    await writeAuditLog(user, {
      entityType: "project",
      entityId: existing.id,
      action: "project.deleted",
      metadata: { name: existing.name, previousStatus: existing.status, softDelete: true },
    }, tx);
    return true;
  });

  if (!deleted) return NextResponse.json({ error: "Projektet hittades inte" }, { status: 404 });
  return NextResponse.json({ success: true });
}
