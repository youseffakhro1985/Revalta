import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await db.workOrder.findFirst({
    where: { id, company_id: user.company_id },
    select: { id: true },
  });
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [comments, history] = await Promise.all([
    db.workOrderComment.findMany({
      where: { company_id: user.company_id, work_order_id: id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        body: true,
        is_internal: true,
        created_at: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.auditLog.findMany({
      where: { company_id: user.company_id, entity_type: "work_order", entity_id: id },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({ comments, history });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await db.workOrder.findFirst({
    where: { id, company_id: user.company_id },
    select: { id: true, title: true },
  });
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const text = String(body.body || "").trim();
  const isInternal = body.isInternal !== false;

  if (!text) return NextResponse.json({ error: "Kommentaren får inte vara tom" }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "Kommentaren är för lång" }, { status: 400 });

  const comment = await db.workOrderComment.create({
    data: {
      company_id: user.company_id,
      work_order_id: id,
      user_id: user.id,
      body: text,
      is_internal: isInternal,
    },
    select: {
      id: true,
      body: true,
      is_internal: true,
      created_at: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: "work_order.comment_added",
    metadata: { commentId: comment.id, isInternal, title: workOrder.title },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
