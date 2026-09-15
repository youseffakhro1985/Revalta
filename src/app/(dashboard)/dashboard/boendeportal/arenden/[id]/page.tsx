import { notFound, redirect } from "next/navigation";
import { ResidentTicketDetailView } from "@/components/dashboard/resident-ticket-detail";
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

export default async function ResidentTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ commented?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = requireCompanyMember(user);
  if (!member || !canAccessResidentPortal(member.role)) notFound();

  const { id } = await params;
  const ticket = await findAccessibleResidentPortalTicket(member, id);
  if (!ticket) notFound();

  const comments = mapResidentPortalComments(ticket.comments, ticket.reporter_name).map((comment) => ({
    ...comment,
    created_at: comment.created_at instanceof Date ? comment.created_at.toISOString() : String(comment.created_at),
  }));
  const query = await searchParams;

  return (
    <ResidentTicketDetailView
      ticketId={ticket.id}
      initialCanComment={canCommentOnResidentPortalTicket(member.role)}
      commented={query.commented === "1"}
      reason={query.reason?.trim() || undefined}
      initialTicket={{
        id: ticket.id,
        public_reference: ticket.public_reference,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        reporter_name: ticket.reporter_name,
        reporter_unit: ticket.reporter_unit,
        created_at: ticket.created_at.toISOString(),
        updated_at: ticket.updated_at.toISOString(),
        property: ticket.property,
        comments,
      }}
    />
  );
}
