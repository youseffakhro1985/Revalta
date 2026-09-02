import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseMoney(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const companyId = user.company_id;

  const { id } = await params;
  const workOrder = await db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: companyId, property: { deleted_at: null } },
    include: {
      property: { select: { id: true, name: true } },
      projects: { where: { deleted_at: null }, select: { id: true, name: true, status: true } },
    },
  });
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  if (workOrder.projects.length > 0) {
    return NextResponse.json({ error: "Arbetsordern är redan kopplad till ett projekt", project: workOrder.projects[0] }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  const managerId = body.managerId ? String(body.managerId).trim() : null;
  const name = String(body.name || workOrder.title).trim();
  const description = body.description ? String(body.description).trim() : workOrder.description;
  const contractor = body.contractor ? String(body.contractor).trim() : null;
  const risk = String(body.risk || "low").trim();
  const startDate = parseOptionalDate(body.startDate ?? workOrder.scheduled_start);
  const endDate = parseOptionalDate(body.endDate ?? workOrder.scheduled_end);
  const budget = parseMoney(body.budget, Number(workOrder.estimated_cost ?? 0));
  const forecast = parseMoney(body.forecast, Number(workOrder.estimated_cost ?? 0));

  if (!name) return NextResponse.json({ error: "Projektnamn krävs" }, { status: 400 });
  if (!["low", "medium", "high"].includes(risk)) return NextResponse.json({ error: "Ogiltig risknivå" }, { status: 400 });
  if (startDate === undefined || endDate === undefined) return NextResponse.json({ error: "Kontrollera projektets datum" }, { status: 400 });
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });
  if (budget === undefined || forecast === undefined) return NextResponse.json({ error: "Kontrollera budget och prognos" }, { status: 400 });

  if (managerId) {
    const manager = await db.user.findFirst({
      where: { id: managerId, company_id: companyId, status: "active" },
      select: { id: true },
    });
    if (!manager) return NextResponse.json({ error: "Projektledaren hittades inte" }, { status: 400 });
  }

  const project = await db.$transaction(async (tx) => {
    const createdProject = await tx.project.create({
      data: {
        company_id: companyId,
        property_id: workOrder.property_id,
        source_work_order_id: workOrder.id,
        manager_id: managerId,
        created_by_id: user.id,
        name,
        description,
        contractor,
        status: "planned",
        risk,
        start_date: startDate,
        end_date: endDate,
        budget,
        forecast,
        actual: 0,
      },
      include: {
        property: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true } },
        source_work_order: { select: { id: true, title: true, status: true } },
      },
    });

    await writeAuditLog(user, {
      entityType: "project",
      entityId: createdProject.id,
      action: "project.created_from_work_order",
      metadata: {
        workOrderId: workOrder.id,
        workOrderTitle: workOrder.title,
        propertyId: workOrder.property_id,
        propertyName: workOrder.property.name,
        managerId,
        budget,
        forecast,
        risk,
      },
    }, tx);

    return createdProject;
  });

  return NextResponse.json({ project }, { status: 201 });
}
