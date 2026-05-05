import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    const token = await signToken({ sub: user.id, email: user.email });

    cookies().set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
