import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { createResetToken, hashResetToken } from "@/lib/auth";
import { canManageTeam, getCurrentUser } from "@/lib/current-user";
import { queueTicketNotification } from "@/lib/integrations";
import { NextResponse } from "next/server";

const allowedRoles = new Set(["admin", "manager", "technician", "viewer"]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageTeam(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa inbjudningar" }, { status: 403 });
    }

    const invites = await db.teamInvite.findMany({
      where: { company_id: user.company_id },
      orderBy: { created_at: "desc" },
      take: 25,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        expires_at: true,
        accepted_at: true,
        created_at: true,
        invited_by: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error("Get team invites error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageTeam(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att bjuda in teammedlemmar" }, { status: 403 });
    }

    const { name, email, role } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" && name.trim() ? name.trim() : null;
    const normalizedRole = typeof role === "string" && allowedRoles.has(role) ? role : "viewer";

    if (!normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "Giltig e-post krävs" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json({ error: "Det finns redan en användare med den e-postadressen" }, { status: 400 });
    }

    const token = createResetToken();
    const invite = await db.teamInvite.create({
      data: {
        company_id: user.company_id,
        invited_by_id: user.id,
        email: normalizedEmail,
        name: normalizedName,
        role: normalizedRole,
        token_hash: hashResetToken(token),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, name: true, role: true, expires_at: true },
    });

    const inviteUrl = `${new URL(request.url).origin}/accept-invite?token=${token}`;
    await writeAuditLog(user, {
      entityType: "team_invite",
      entityId: invite.id,
      action: "team.invite_created",
      metadata: { email: invite.email, role: invite.role },
    });
    await queueTicketNotification(user, {
      ticketId: invite.id,
      title: "Inbjudan till Revalta",
      recipient: invite.email,
      event: "updated",
    });

    return NextResponse.json({
      success: true,
      invite,
      inviteUrl: process.env.EMAIL_PROVIDER_API_KEY ? undefined : inviteUrl,
    }, { status: 201 });
  } catch (error) {
    console.error("Create team invite error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
