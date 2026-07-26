import { NextResponse } from "next/server";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  const logs = await db.auditLog.findMany({
    where: { ...auditScopedWhere(user), entity_type: "round" },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const rounds = logs.map((log) => ({ id: log.id, createdAt: log.created_at, ...(log.metadata as Record<string, unknown>) }));
  return NextResponse.json({ rounds });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
  const interval = typeof body.interval === "string" ? body.interval.trim() : "monthly";
  const checklist = Array.isArray(body.checklist) ? body.checklist.filter((item: unknown) => typeof item === "string" && item.trim()).map((item: string) => item.trim()) : [];

  if (!title || !propertyId || checklist.length === 0) {
    return NextResponse.json({ error: "Titel, fastighet och minst en kontrollpunkt krävs" }, { status: 400 });
  }

  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const nextDue = new Date();
  const days = interval === "weekly" ? 7 : interval === "quarterly" ? 90 : interval === "yearly" ? 365 : 30;
  nextDue.setDate(nextDue.getDate() + days);

  await writeAuditLog(user, {
    entityType: "round",
    entityId: property.id,
    action: "round.created",
    metadata: {
      title,
      propertyId,
      propertyName: property.name,
      interval,
      status: "planned",
      nextDue: nextDue.toISOString(),
      checklist: checklist.map((label: string) => ({ label, completed: false })),
      deviations: 0,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
