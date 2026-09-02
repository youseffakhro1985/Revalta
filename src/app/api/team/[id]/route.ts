import db from "@/lib/db";
import { canGrantTeamRole, canManageTeam, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/team/[id]" });

const allowedRoles = new Set(["owner", "admin", "manager", "technician", "viewer", "resident"]);
const allowedStatuses = new Set(["active", "inactive"]);

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

class TeamMutationConflict extends Error {
  constructor() {
    super("Teammedlemmen ändrades samtidigt");
    this.name = "TeamMutationConflict";
  }
}

type TeamMutationResult =
  | { kind: "not_found" }
  | { kind: "forbidden_member" }
  | { kind: "last_owner" }
  | { kind: "ok"; member: unknown };

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

    const data: Record<string, unknown> = {};
    if (requestedRole !== undefined) data.role = requestedRole;
    if (requestedStatus !== undefined) data.status = requestedStatus;

    const lockKey = `team-membership:${companyId}`;
    const result = await db.$transaction<TeamMutationResult>(async (tx) => {
      // Serialize privilege mutations for one company. This makes the last-owner
      // invariant race-safe when two owners are changed concurrently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const target = await tx.user.findFirst({
        where: { id: targetId, company_id: companyId },
        select: { id: true, role: true, status: true },
      });
      if (!target) return { kind: "not_found" };

      if (!canGrantTeamRole(user.role, target.role)) {
        return { kind: "forbidden_member" };
      }

      const demotesFromOwner = requestedRole !== undefined && target.role === "owner" && requestedRole !== "owner";
      const deactivatesOwner = requestedStatus === "inactive" && target.role === "owner" && target.status === "active";
      if (demotesFromOwner || deactivatesOwner) {
        const otherActiveOwners = await tx.user.count({
          where: { company_id: companyId, role: "owner", status: "active", id: { not: targetId } },
        });
        if (otherActiveOwners === 0) return { kind: "last_owner" };
      }

      const update = await tx.user.updateMany({
        where: { id: targetId, company_id: companyId },
        data,
      });
      if (update.count !== 1) return { kind: "not_found" };

      const member = await tx.user.findFirst({
        where: { id: targetId, company_id: companyId },
        select: memberSelect,
      });
      if (!member) throw new TeamMutationConflict();

      await writeAuditLog(user, {
        entityType: "user",
        entityId: targetId,
        action: requestedStatus !== undefined ? "team.member_status_changed" : "team.member_role_changed",
        metadata: {
          ...(requestedRole !== undefined ? { previousRole: target.role, role: requestedRole } : {}),
          ...(requestedStatus !== undefined ? { previousStatus: target.status, status: requestedStatus } : {}),
        },
      }, tx);

      return { kind: "ok", member };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Teammedlemmen hittades inte" }, { status: 404 });
    }
    if (result.kind === "forbidden_member") {
      return NextResponse.json({ error: "Du saknar behörighet att ändra den här medlemmen" }, { status: 403 });
    }
    if (result.kind === "last_owner") {
      return NextResponse.json({ error: "Företaget måste ha minst en aktiv ägare" }, { status: 400 });
    }

    return NextResponse.json({ success: true, member: result.member });
  } catch (error) {
    if (error instanceof TeamMutationConflict) {
      return NextResponse.json({ error: "Teammedlemmen ändrades samtidigt. Ladda om och försök igen." }, { status: 409 });
    }
    logger.error("Update team member error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
