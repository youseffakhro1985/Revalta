import db from "@/lib/db";
import { canViewAudit, getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewAudit(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa audit log" }, { status: 403 });
    }

    const auditLogs = await db.auditLog.findMany({
      where: user.company_id ? { company_id: user.company_id } : { actor_user_id: user.id },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        entity_type: true,
        entity_id: true,
        action: true,
        metadata: true,
        created_at: true,
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ auditLogs });
  } catch (error) {
    console.error("Get audit log error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
