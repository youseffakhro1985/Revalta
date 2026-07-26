import db from "@/lib/db";
import { canManageTeam, getCurrentUser } from "@/lib/current-user";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";
import { isStrongPassword, isValidEmail, normalizeEmail, passwordPolicyMessage } from "@/lib/security";

const allowedRoles = new Set(["owner", "admin", "manager", "technician", "viewer"]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

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
            assigned_tickets: { where: { deleted_at: null } },
          },
        },
      },
    });

    return NextResponse.json({
      company: user.company,
      members,
      canManage: canManageTeam(user.role),
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
    const normalizedRole = typeof role === "string" && allowedRoles.has(role) ? role : "viewer";

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "En giltig e-postadress krävs" }, { status: 400 });
    }
    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: passwordPolicyMessage }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "E-postadressen används redan" }, { status: 400 });
    }

    const member = await db.user.create({
      data: {
        email: normalizedEmail,
        password: await hashPassword(password),
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
            assigned_tickets: { where: { deleted_at: null } },
          },
        },
      },
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: member.id,
      action: "team.member_created",
      metadata: { email: member.email, role: member.role },
    });

    return NextResponse.json({ success: true, member }, { status: 201 });
  } catch (error) {
    console.error("Create team member error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
