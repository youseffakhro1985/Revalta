import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser } from "@/lib/current-user";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canCreateProperties(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa fastigheter" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: { not: null } },
      select: { id: true, name: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Fastigheten hittades inte eller är redan aktiv" }, { status: 404 });
    }

    const restoreResult = await db.property.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    if (restoreResult.count === 0) {
      return NextResponse.json({ error: "Fastigheten hittades inte eller är redan aktiv" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: existing.id,
      action: "property.restored",
      metadata: { name: existing.name, previousStatus: existing.status, softDelete: true },
    });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Restore property error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
