import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { NextResponse } from "next/server";

type TimelineItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: Date;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const { id } = await params;

    const ticket = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: {
        id: true,
        title: true,
        created_at: true,
        comments: {
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            body: true,
            is_internal: true,
            created_at: true,
            user: { select: { name: true, email: true } },
          },
        },
        attachments: {
          orderBy: { created_at: "asc" },
          select: { id: true, file_name: true, visibility: true, created_at: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const auditLogs = await db.auditLog.findMany({
      where: { entity_type: "ticket", entity_id: ticket.id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
        actor: { select: { name: true, email: true } },
      },
    });

    const items: TimelineItem[] = [
      {
        id: `created-${ticket.id}`,
        type: "created",
        title: "Ärende skapat",
        description: ticket.title,
        created_at: ticket.created_at,
      },
      ...ticket.comments.map((comment) => ({
        id: comment.id,
        type: "comment",
        title: comment.is_internal ? "Intern kommentar" : "Kommentar",
        description: `${comment.user.name || comment.user.email}: ${comment.body}`,
        created_at: comment.created_at,
      })),
      ...ticket.attachments.map((attachment) => ({
        id: attachment.id,
        type: "attachment",
        title: attachment.visibility === "public" ? "Publik bilaga uppladdad" : "Bilaga uppladdad",
        description: attachment.file_name,
        created_at: attachment.created_at,
      })),
      ...auditLogs.map((log) => ({
        id: log.id,
        type: "audit",
        title: log.action,
        description: log.actor?.name || log.actor?.email || "System",
        created_at: log.created_at,
      })),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return NextResponse.json({ timeline: items });
  } catch (error) {
    console.error("Get ticket timeline error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
