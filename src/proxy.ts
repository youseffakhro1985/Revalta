import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isResident } from "@/lib/permissions";
import {
  isStaffOnlyApiPath,
  isStaffOnlyDashboardPath,
  residentHomePath,
} from "@/lib/resident-access";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { verifyToken } from "@/lib/session";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session-policy";

async function resolveSessionRole(sessionSub: string, sessionEmail: string) {
  const user = await db.user.findUnique({
    where: { id: sessionSub },
    select: { role: true, status: true, email: true },
  });
  if (!user || user.status !== "active") return null;
  if (user.email.toLowerCase() !== sessionEmail.toLowerCase()) return null;
  return user.role;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (pathname.startsWith("/api/") && pathname !== "/api/stripe/webhook" && unsafeMethod) {
    if (!isTrustedMutationRequest(request)) {
      return NextResponse.json({ error: "Otillåtet anrop" }, { status: 403 });
    }
  }

  const token =
    request.cookies.get(SESSION_COOKIE_NAME)?.value ||
    request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/dashboard") && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return NextResponse.redirect(new URL(residentHomePath(), request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && isStaffOnlyDashboardPath(pathname)) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return NextResponse.redirect(new URL(residentHomePath(), request.url));
    }
  }

  if (session && isStaffOnlyApiPath(pathname)) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return NextResponse.json(
        { error: "Boende har endast åtkomst till boendeportalen" },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/api/:path*"],
};
