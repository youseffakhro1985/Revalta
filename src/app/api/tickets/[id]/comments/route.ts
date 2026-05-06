import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const { id } = await params;
    const { body, isInternal } = await request.json();
    const normalizedBody = typeof body === "string" ? body.trim() : "";

    if (!normalizedBody) {
      return NextResponse.json({ error: "Kommentar krävs" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: { id: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const comment = await db.ticketComment.create({
      data: {
        ticket_id: ticket.id,
        user_id: user.id,
        body: normalizedBody,
        is_internal: Boolean(isInternal),
      },
      select: {
        id: true,
        body: true,
        is_internal: true,
        created_at: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    console.error("Create ticket comment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
