import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    const membership = user?.memberships[0];
    if (!user || !membership) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const ticket = await db.ticket.findFirst({
      where: {
        id: params.id,
        companyId: membership.companyId,
        deletedAt: null,
      },
      include: {
        property: true,
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
        history: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("Get ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
