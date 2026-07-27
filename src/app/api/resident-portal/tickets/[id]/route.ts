import { NextResponse } from "next/server";
import {
  canAccessResidentPortal,
  getCurrentUser,
  requireCompanyMember,
} from "@/lib/current-user";
import {
  canCommentOnResidentPortalTicket,
  findAccessibleResidentPortalTicket,
  mapResidentPortalComments,
} from "@/lib/resident-portal-tickets";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet till boendeportalen" }, { status: 403 });
    }

    const { id } = await params;
    const ticket = await findAccessibleResidentPortalTicket(user, id);
    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    return NextResponse.json({
      canComment: canCommentOnResidentPortalTicket(user.role),
      ticket: {
        id: ticket.id,
        public_reference: ticket.public_reference,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        reporter_name: ticket.reporter_name,
        reporter_unit: ticket.reporter_unit,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        property: ticket.property,
        comments: mapResidentPortalComments(ticket.comments, ticket.reporter_name),
      },
    });
  } catch (error) {
    console.error("Get resident portal ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
