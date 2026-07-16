import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många inloggningsförsök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { email, password } = await request.json();
    const normalizedEmail = normalizeEmail(email);
    
    if (!isValidEmail(normalizedEmail) || typeof password !== "string" || !password) {
      return NextResponse.json({ error: "E-post och lösenord krävs" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: { company: { select: { status: true } } },
    });
    
    if (!user) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    if (user.status !== "active" || (user.company && user.company.status !== "active")) {
      return NextResponse.json({ error: "Kontot är inte aktivt. Kontakta organisationens administratör." }, { status: 403 });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401 });
    }

    const token = await signToken({ sub: user.id, email: user.email, name: user.name });
    
    const cookieStore = await cookies();
    cookieStore.set("token", token, {
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
