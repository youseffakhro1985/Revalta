import db from "@/lib/db";
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

    const { id: targetId } = await params;
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "Du kan inte ändra ditt eget konto här — använd kontoinställningarna" },
        { status: 400 },
      );
    }

    const target = await db.user.findFirst({
      where: { id: targetId, company_id: user.company_id },
      select: { id: true, role: true, status: true },
    });
    if (!target) return NextResponse.json({ error: "Teammedlemmen hittades inte" }, { status: 404 });

    if (!canGrantTeamRole(user.role, target.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra den här medlemmen" }, { status: 403 });
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

    const demotesFromOwner = requestedRole !== undefined && target.role === "owner" && requestedRole !== "owner";
    const deactivatesOwner = requestedStatus === "inactive" && target.role === "owner" && target.status === "active";
    if (demotesFromOwner || deactivatesOwner) {
      const otherActiveOwners = await db.user.count({
        where: { company_id: user.company_id, role: "owner", status: "active", id: { not: targetId } },
      });
      if (otherActiveOwners === 0) {
        return NextResponse.json(
          { error: "Företaget måste ha minst en aktiv ägare" },
          { status: 400 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (requestedRole !== undefined) data.role = requestedRole;
    if (requestedStatus !== undefined) data.status = requestedStatus;

    const updated = await updateOwnedByCompany<TeamMemberRecord>(
      "user",
      { id: targetId, companyId: user.company_id, data },
      db,
    );
    if (!updated) return NextResponse.json({ error: "Teammedlemmen hittades inte" }, { status: 404 });

    const member = await db.user.findFirst({
      where: { id: targetId, company_id: user.company_id },
      select: memberSelect,
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: targetId,
      action: requestedStatus !== undefined ? "team.member_status_changed" : "team.member_role_changed",
      metadata: {
        ...(requestedRole !== undefined ? { previousRole: target.role, role: requestedRole } : {}),
        ...(requestedStatus !== undefined ? { previousStatus: target.status, status: requestedStatus } : {}),
      },
    });

    return NextResponse.json({ success: true, member });
  } catch (error) {
    logger.error("Update team member error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
