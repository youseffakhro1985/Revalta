import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { canGrantTeamRole, canManageTeam, getCurrentUser } from "@/lib/current-user";
import { updateOwnedByCompany } from "@/lib/tenant-writes";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/team/[id]" });

const allowedRoles = new Set(["owner", "admin", "manager", "technician", "viewer", "resident"]);
const allowedStatuses = new Set(["active", "inactive"]);

type TeamMemberRecord = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  created_at: Date;
};

class TeamMutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function isTransactionConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

const memberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  created_at: true,
  _count: {
    select: {
      assigned_tickets: {
        where: {
          deleted_at: null,
          OR: [{ property_id: null }, { property: { deleted_at: null } }],
        },
      },
    },
  },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageTeam(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att hantera teammedlemmar" }, { status: 403 });
    }
    const companyId = user.company_id;

    const { id: targetId } = await params;
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "Du kan inte ändra ditt eget konto här — använd kontoinställningarna" },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as { role?: unknown; status?: unknown } | null;
    const requestedRole = typeof body?.role === "string" ? body.role : undefined;
    const requestedStatus = typeof body?.status === "string" ? body.status : undefined;

    if (requestedRole === undefined && requestedStatus === undefined) {
      return NextResponse.json({ error: "Ingen ändring angiven" }, { status: 400 });
    }
    if (requestedRole !== undefined && !allowedRoles.has(requestedRole)) {
      return NextResponse.json({ error: "Ogiltig användarroll" }, { status: 400 });
    }
    if (requestedRole !== undefined && !canGrantTeamRole(user.role, requestedRole)) {
      return NextResponse.json({ error: "Du saknar behörighet att tilldela ägarrollen" }, { status: 403 });
    }
    if (requestedStatus !== undefined && !allowedStatuses.has(requestedStatus)) {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const member = await db.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: targetId, company_id: companyId },
        select: { id: true, role: true, status: true },
      });
      if (!target) throw new TeamMutationError(404, "Teammedlemmen hittades inte");

      if (!canGrantTeamRole(user.role, target.role)) {
        throw new TeamMutationError(403, "Du saknar behörighet att ändra den här medlemmen");
      }

      const demotesFromOwner = requestedRole !== undefined && target.role === "owner" && requestedRole !== "owner";
      const deactivatesOwner = requestedStatus === "inactive" && target.role === "owner" && target.status === "active";
      if (demotesFromOwner || deactivatesOwner) {
        const otherActiveOwners = await tx.user.count({
          where: { company_id: companyId, role: "owner", status: "active", id: { not: targetId } },
        });
        if (otherActiveOwners === 0) {
          throw new TeamMutationError(400, "Företaget måste ha minst en aktiv ägare");
        }
      }

      const data: Record<string, unknown> = {};
      if (requestedRole !== undefined) data.role = requestedRole;
      if (requestedStatus !== undefined) data.status = requestedStatus;

      const updated = await updateOwnedByCompany<TeamMemberRecord>(
        "user",
        { id: targetId, companyId, data },
        tx,
      );
      if (!updated) throw new TeamMutationError(404, "Teammedlemmen hittades inte");

      const refreshedMember = await tx.user.findFirst({
        where: { id: targetId, company_id: companyId },
        select: memberSelect,
      });
      if (!refreshedMember) throw new TeamMutationError(404, "Teammedlemmen hittades inte");

      await writeAuditLog(user, {
        entityType: "user",
        entityId: targetId,
        action: requestedStatus !== undefined ? "team.member_status_changed" : "team.member_role_changed",
        metadata: {
          ...(requestedRole !== undefined ? { previousRole: target.role, role: requestedRole } : {}),
          ...(requestedStatus !== undefined ? { previousStatus: target.status, status: requestedStatus } : {}),
        },
      }, tx);

      return refreshedMember;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, member });
  } catch (error) {
    if (error instanceof TeamMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isTransactionConflict(error)) {
      return NextResponse.json(
        { error: "Teamet ändrades samtidigt av någon annan. Ladda om och försök igen." },
        { status: 409 },
      );
    }
    logger.error("Update team member error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
