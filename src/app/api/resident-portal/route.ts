import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "resident.portal.contact";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const logs = await db.auditLog.findMany({
      where: { company_id: user.company_id ?? undefined, action },
      orderBy: { created_at: "desc" },
      take: 250,
      select: { id: true, metadata: true, created_at: true },
    });

    return NextResponse.json({
      items: logs.map((log) => ({ id: log.id, ...(log.metadata as Record<string, unknown>), createdAt: log.created_at })),
    });
  } catch (error) {
    console.error("Get resident portal items error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = await request.json();
    const residentName = String(body.residentName || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!residentName || !subject || !message) {
      return NextResponse.json({ error: "Namn, ämne och beskrivning krävs" }, { status: 400 });
    }

    await writeAuditLog(user, {
      entityType: "resident_contact",
      entityId: crypto.randomUUID(),
      action,
      metadata: {
        residentName,
        email: String(body.email || "").trim(),
        phone: String(body.phone || "").trim(),
        propertyName: String(body.propertyName || "").trim(),
        unit: String(body.unit || "").trim(),
        subject,
        message,
        status: "new",
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create resident portal item error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}