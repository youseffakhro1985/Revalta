import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword, hashResetToken, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { homePathForRole } from "@/lib/resident-access";
import { isStrongPassword, passwordPolicyMessage, safeInternalPath } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/team/invites/accept" });

class InviteClaimConflictError extends Error {}
class InviteEmailConflictError extends Error {}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

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

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readAcceptFields(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return {
      token: String(form?.get("token") || "").trim(),
      password: String(form?.get("password") || ""),
      name: String(form?.get("name") || "").trim(),
    };
  }
  const body = await request.json().catch(() => ({})) as {
    token?: unknown;
    password?: unknown;
    name?: unknown;
  };
  return {
    token: typeof body.token === "string" ? body.token.trim() : "",
    password: typeof body.password === "string" ? body.password : "",
    name: typeof body.name === "string" ? body.name.trim() : "",
  };
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
  const nativeForm = isNativeFormPost(request);
  const fail = (
    status: number,
    message: string,
    reason: "invalid" | "policy" | "exists" | "rate" | "error",
    token?: string,
    headers?: HeadersInit,
  ) => {
    if (!nativeForm) {
      return noStore({ error: message }, { status, headers });
    }
    const url = new URL("/accept-invite", getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    if (token) url.searchParams.set("token", token);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    if (headers) {
      new Headers(headers).forEach((value, name) => {
        if (name.toLowerCase() === "retry-after") response.headers.set(name, value);
      });
    }
    return response;
  };

  let token = "";
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`invite-accept:${ip}`, 12, 60 * 60 * 1000);
    const fields = nativeForm || rateLimit.allowed
      ? await readAcceptFields(request)
      : { token: "", password: "", name: "" };
    token = fields.token;
    if (!rateLimit.allowed) {
      return fail(
        429,
        "För många försök. Vänta en stund och prova igen.",
        "rate",
        token,
        {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
        },
      );
    }

    const password = fields.password;
    const requestedName = fields.name;
    if (!token) {
      return fail(400, "Inbjudningslänken saknas", "invalid");
    }
    if (requestedName.length > 120) {
      return fail(400, "Namnet får vara högst 120 tecken", "invalid", token);
    }
    if (!isStrongPassword(password)) {
      return fail(400, passwordPolicyMessage, "policy", token);
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

    const now = new Date();
    if (!invite || invite.accepted_at || invite.expires_at < now) {
      return fail(400, "Inbjudan är ogiltig eller har gått ut", "invalid", token);
    }
    if (invite.company.status !== "active") {
      return fail(400, "Organisationen är inte aktiv", "invalid", token);
    }

    const normalizedName = requestedName || invite.name;
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: invite.email },
        select: { id: true },
      });
      if (existingUser) throw new InviteEmailConflictError();

      const claimed = await tx.teamInvite.updateMany({
        where: {
          id: invite.id,
          accepted_at: null,
          expires_at: { gte: now },
        },
        data: { accepted_at: now },
      });
      if (claimed.count !== 1) throw new InviteClaimConflictError();

      const createdUser = await tx.user.create({
        data: {
          email: invite.email,
          password: passwordHash,
          name: normalizedName,
          role: invite.role,
          status: "active",
          company_id: invite.company_id,
          email_verified_at: now,
        },
        select: { id: true, email: true, name: true, role: true, company_id: true },
      });

      await writeAuditLog(createdUser, {
        entityType: "user",
        entityId: createdUser.id,
        action: "team.invite_accepted",
        metadata: { email: createdUser.email, role: createdUser.role },
      }, tx);

      return createdUser;
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

    const redirectTo = safeInternalPath(homePathForRole(user.role), "/dashboard");
    if (nativeForm) {
      const response = NextResponse.redirect(new URL(redirectTo, getPublicAppUrl(request.url)), 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }
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
    if (error instanceof InviteClaimConflictError) {
      return fail(409, "Inbjudan har redan använts eller gått ut", "invalid", token);
    }
    if (error instanceof InviteEmailConflictError || isUniqueConstraintError(error)) {
      return fail(409, "Det finns redan ett konto med den här e-postadressen. Logga in i stället.", "exists", token);
    }
    logger.error("Accept team invite error", error);
    return fail(500, "Internt serverfel", "error", token);
  }
}
