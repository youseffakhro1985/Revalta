import db from "@/lib/db";
import { canManageTeam, getCurrentUser } from "@/lib/current-user";
import { hashPassword } from "@/lib/auth";
import { NextResponse } from "next/server";

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
            assigned_tickets: true,
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
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : null;
    const normalizedRole = typeof role === "string" && allowedRoles.has(role) ? role : "viewer";

    if (!normalizedEmail || !normalizedEmail.includes("@") || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "E-post och minst 6 tecken i lösenord krävs" }, { status: 400 });
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
            assigned_tickets: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, member }, { status: 201 });
  } catch (error) {
    console.error("Create team member error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
