import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: {
            status: { notIn: ["blocked", "deleted"] },
            company: { status: "active", deletedAt: null },
          },
          include: { company: true },
          take: 1,
        },
      },
    });
    
    if (!user) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    if (user.status === "blocked" || user.status === "deleted") {
      return NextResponse.json({ error: "Kontot är inte aktivt" }, { status: 403 });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    const membership = user.memberships[0];
    if (!membership) {
      return NextResponse.json({ error: "Inget aktivt företag är kopplat till kontot" }, { status: 403 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await db.auditLog.create({
      data: {
        actorUserId: user.id,
        companyId: membership.companyId,
        entityType: "user",
        entityId: user.id,
        action: "user_login",
      },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      companyId: membership.companyId,
      role: membership.role,
    });
    
    cookies().set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 24 timmar
      path: "/",
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
        companyId: membership.companyId,
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
