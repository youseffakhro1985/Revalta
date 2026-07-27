import db from "@/lib/db";
import {
  canAccessResidentPortal,
  canCreateResidentPortalTicket,
  isResident,
  type CompanyUser,
} from "@/lib/current-user";
import { reporterEmailMatch } from "@/lib/resident-portal-scope";

const ticketDetailSelect = {
  id: true,
  company_id: true,
  user_id: true,
  public_reference: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  category: true,
  reporter_name: true,
  reporter_email: true,
  reporter_phone: true,
  reporter_unit: true,
  created_at: true,
  updated_at: true,
  property: { select: { name: true, address: true, city: true } },
  comments: {
    where: { is_internal: false },
    orderBy: { created_at: "asc" as const },
    select: {
      id: true,
      body: true,
      created_at: true,
      author_type: true,
      author_name: true,
      user: { select: { name: true } },
    },
  },
} as const;

export type ResidentPortalTicketDetail = NonNullable<
  Awaited<ReturnType<typeof findAccessibleResidentPortalTicket>>
>;

/** Company-scoped resident_portal ticket; residents are email-matched. */
export async function findAccessibleResidentPortalTicket(
  user: CompanyUser,
  ticketId: string,
) {
  if (!canAccessResidentPortal(user.role)) return null;

  return db.ticket.findFirst({
    where: {
      id: ticketId,
      company_id: user.company_id,
      source: "resident_portal",
      deleted_at: null,
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
      ...(isResident(user.role) ? { reporter_email: reporterEmailMatch(user.email) } : {}),
    },
    select: ticketDetailSelect,
  });
}

export function canCommentOnResidentPortalTicket(role: string) {
  return canCreateResidentPortalTicket(role);
}

export function mapResidentPortalComments(
  comments: ResidentPortalTicketDetail["comments"],
  fallbackResidentName: string | null,
) {
  return comments.map((comment) => {
    if (comment.author_type === "resident") {
      return {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: {
          type: "resident" as const,
          name: comment.author_name || fallbackResidentName || "Boende",
        },
      };
    }
    return {
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at,
      author: {
        type: "management" as const,
        name: comment.author_name || comment.user.name || "Förvaltningen",
      },
    };
  });
}
