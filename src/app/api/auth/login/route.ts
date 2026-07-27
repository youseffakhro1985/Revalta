import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

function rateLimitHeaders(resetAt: Date, remaining: number) {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-Content-Type-Options": "nosniff",
  };
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown };
    const normalizedEmail = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`login:ip:${ip}`, 12, 15 * 60 * 1000),
      checkRateLimit(`login:account:${normalizedEmail || "invalid"}`, 6, 15 * 60 * 1000),
    ]);
    const strictest = ipLimit.resetAt > accountLimit.resetAt ? ipLimit : accountLimit;
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return NextResponse.json(
        { error: "För många inloggningsförsök. Vänta en stund och prova igen." },
        { status: 429, headers: rateLimitHeaders(strictest.resetAt, strictest.remaining) },
      );
    }

    if (!isValidEmail(normalizedEmail) || password.length < 1 || password.length > 512) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const user = await db.user.findUnique({ where: { email: normalizedEmail }, include: { company: { select: { status: true } } } });
    const valid = user ? await comparePassword(password, user.password) : false;
    if (!user || !valid || user.status !== "active" || (user.company && user.company.status !== "active")) {
      return NextResponse.json({ error: "Ogiltiga uppgifter" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const latestPasswordChange = await db.auditLog.findFirst({
      where: {
        actor_user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        action: "user.password_changed",
      },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      passwordChangedAt: latestPasswordChange?.created_at.getTime() ?? null,
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

    return NextResponse.json(
      { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
