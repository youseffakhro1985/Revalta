import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [rows, logs] = await Promise.all([
      db.inspectionRound.findMany({
        where: { company_id: user.company_id },
        orderBy: { created_at: "desc" },
        take: 100,
        include: { property: { select: { name: true } } },
      }),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), entity_type: "round" },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
    ]);

    const modernIds = new Set(rows.map((row) => row.id));
    const modern = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      title: row.title,
      propertyId: row.property_id,
      propertyName: row.property.name,
      interval: row.interval,
      status: row.status,
      nextDue: row.next_due.toISOString(),
      checklist: row.checklist,
      deviations: row.deviations,
      source: "table" as const,
    }));

    const legacy = logs
      .filter((log) => !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        createdAt: log.created_at,
        ...(log.metadata as Record<string, unknown>),
        source: "legacy" as const,
      }));

    return NextResponse.json({
      rounds: [...modern, ...legacy]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100),
    });
  } catch (error) {
    console.error("Get rounds error:", error);
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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const interval = typeof body.interval === "string" ? body.interval.trim() : "monthly";
    const checklist = Array.isArray(body.checklist)
      ? body.checklist.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim())
      : [];

    if (!title || !propertyId || checklist.length === 0) {
      return NextResponse.json({ error: "Titel, fastighet och minst en kontrollpunkt krävs" }, { status: 400 });
    }
    if (!["weekly", "monthly", "quarterly", "yearly"].includes(interval)) {
      return NextResponse.json({ error: "Ogiltigt intervall" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const nextDue = new Date();
    const days = interval === "weekly" ? 7 : interval === "quarterly" ? 90 : interval === "yearly" ? 365 : 30;
    nextDue.setDate(nextDue.getDate() + days);

    const checklistPayload = checklist.map((label: string) => ({ label, completed: false })) as Prisma.InputJsonValue;

    const round = await db.inspectionRound.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        title,
        interval,
        status: "planned",
        next_due: nextDue,
        checklist: checklistPayload,
        deviations: 0,
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "round",
      entityId: round.id,
      action: "round.created",
      metadata: {
        title,
        propertyId: property.id,
        propertyName: property.name,
        interval,
        status: "planned",
        nextDue: nextDue.toISOString(),
        checklist: checklistPayload,
        deviations: 0,
        storage: "InspectionRound",
      },
    });

    return NextResponse.json({ success: true, round }, { status: 201 });
  } catch (error) {
    console.error("Create round error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
