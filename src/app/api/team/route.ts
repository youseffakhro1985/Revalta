import db from "@/lib/db";
import {
  canAssignWorkOrders,
  canGrantTeamRole,
  canManageTeam,
  canViewLeasingData,
  getCurrentUser,
} from "@/lib/current-user";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";
import { isStrongPassword, isValidEmail, normalizeEmail, passwordPolicyMessage } from "@/lib/security";

const allowedRoles = new Set(["owner", "admin", "manager", "technician", "viewer", "resident"]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const canSeeFullRoster =
      canManageTeam(user.role) || canAssignWorkOrders(user.role) || canViewLeasingData(user.role);

    if (!canSeeFullRoster) {
      const members = await db.user.findMany({
        where: user.company_id
          ? { company_id: user.company_id, status: "active", role: { not: "resident" } }
          : { id: user.id },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, role: true, status: true },
      });
      return NextResponse.json({
        company: user.company,
        members,
        canManage: false,
        permissions: { canManage: false, canSeeEmails: false },
      });
    }

    const members = await db.user.findMany({
      where: user.company_id ? { company_id: user.company_id } : { id: user.id },
      orderBy: { created_at: "asc" },
      select: {
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
      },
    });

    return NextResponse.json({
      company: user.company,
      members,
      canManage: canManageTeam(user.role),
      permissions: { canManage: canManageTeam(user.role), canSeeEmails: true },
    });
  } catch (error) {
    console.error("Get team error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageTeam(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att lägga till teammedlemmar" }, { status: 403 });
    }

    const { name, email, role, password } = await request.json();
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = typeof name === "string" ? name.trim() : null;
    const normalizedRole = typeof role === "string" ? role : "";

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "En giltig e-postadress krävs" }, { status: 400 });
    }
    if ((normalizedName?.length ?? 0) > 120) {
      return NextResponse.json({ error: "Namnet får vara högst 120 tecken" }, { status: 400 });
    }
    if (!allowedRoles.has(normalizedRole)) {
      return NextResponse.json({ error: "Ogiltig användarroll" }, { status: 400 });
    }
    if (!canGrantTeamRole(user.role, normalizedRole)) {
      return NextResponse.json({ error: "Du saknar behörighet att tilldela ägarrollen" }, { status: 403 });
    }
    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: passwordPolicyMessage }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const member = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: passwordHash,
          name: normalizedName,
          role: normalizedRole,
          company_id: user.company_id,
        },
        select: {
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
        },
      });
      await writeAuditLog(user, {
        entityType: "user",
        entityId: created.id,
        action: "team.member_created",
        metadata: { email: created.email, role: created.role },
      }, tx);
      return created;
    });

    return NextResponse.json({ success: true, member }, { status: 201 });
  } catch (error) {
    console.error("Create team member error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
