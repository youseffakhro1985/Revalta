import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword, hashResetToken, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { homePathForRole } from "@/lib/resident-access";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/team/invites/accept" });

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers || {}),
    },
  });
}

async function loadInvitePreview(token: string) {
  return db.teamInvite.findUnique({
    where: { token_hash: hashResetToken(token) },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      expires_at: true,
      accepted_at: true,
      company: { select: { name: true, status: true } },
    },
  });
}

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`invite-preview:${ip}`, 30, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return noStore({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const token = new URL(request.url).searchParams.get("token")?.trim() || "";
    if (!token) {
      return noStore({ error: "Inbjudningslänken saknas" }, { status: 400 });
    }

    const invite = await loadInvitePreview(token);
    if (!invite || invite.accepted_at || invite.expires_at < new Date()) {
      return noStore({ error: "Inbjudan är ogiltig eller har gått ut" }, { status: 400 });
    }
    if (invite.company.status !== "active") {
      return noStore({ error: "Organisationen är inte aktiv" }, { status: 400 });
    }

    return noStore({
      invite: {
        email: invite.email,
        name: invite.name,
        role: invite.role,
        companyName: invite.company.name,
        redirectTo: homePathForRole(invite.role),
      },
    });
  } catch (error) {
    logger.error("Preview team invite error", error);
    return noStore({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`invite-accept:${ip}`, 12, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return noStore({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({})) as {
      token?: unknown;
      password?: unknown;
      name?: unknown;
    };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!token) {
      return noStore({ error: "Inbjudningslänken saknas" }, { status: 400 });
    }
    if (!isStrongPassword(password)) {
      return noStore({ error: passwordPolicyMessage }, { status: 400 });
    }

    const invite = await db.teamInvite.findUnique({
      where: { token_hash: hashResetToken(token) },
      select: {
        id: true,
        company_id: true,
        email: true,
        name: true,
        role: true,
        expires_at: true,
        accepted_at: true,
        company: { select: { status: true } },
      },
    });

    if (!invite || invite.accepted_at || invite.expires_at < new Date()) {
      return noStore({ error: "Inbjudan är ogiltig eller har gått ut" }, { status: 400 });
    }
    if (invite.company.status !== "active") {
      return noStore({ error: "Organisationen är inte aktiv" }, { status: 400 });
    }

    const normalizedName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : invite.name;
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invite.email,
          password: await hashPassword(password),
          name: normalizedName,
          role: invite.role,
          status: "active",
          company_id: invite.company_id,
          email_verified_at: new Date(),
        },
        select: { id: true, email: true, name: true, role: true, company_id: true },
      });

      await tx.teamInvite.update({
        where: { id: invite.id },
        data: { accepted_at: new Date() },
      });

      return createdUser;
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: user.id,
      action: "team.invite_accepted",
      metadata: { email: user.email, role: user.role },
    });

    const sessionToken = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      passwordChangedAt: null,
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

    const redirectTo = homePathForRole(user.role);
    return noStore({
      success: true,
      redirectTo,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Accept team invite error", error);
    return noStore({ error: "Internt serverfel" }, { status: 500 });
  }
}
