import { NextRequest, NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { isResident } from "@/lib/permissions";
import {
  isStaffOnlyApiPath,
  isStaffOnlyDashboardPath,
  residentHomePath,
} from "@/lib/resident-access";
import {
  correlatedRequestHeaders,
  resolveRequestId,
  withRequestCorrelation,
} from "@/lib/request-correlation";
import {
  isDeclaredRequestBodyTooLarge,
  isTrustedMutationRequest,
} from "@/lib/request-security";
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
  const requestId = resolveRequestId(request.headers);
  const correlate = <T extends Response>(response: T) =>
    withRequestCorrelation(response, requestId) as T;

  if (pathname.startsWith("/api/") && pathname !== "/api/stripe/webhook" && unsafeMethod) {
    if (isDeclaredRequestBodyTooLarge(request)) {
      return apiErrorResponse({
        status: 413,
        code: API_ERROR_CODES.payloadTooLarge,
        message: "Förfrågan är för stor",
        requestId,
      });
    }
    if (!isTrustedMutationRequest(request)) {
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.untrustedMutation,
        message: "Otillåtet anrop",
        requestId,
      });
    }
  }

  const token =
    request.cookies.get(SESSION_COOKIE_NAME)?.value ||
    request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/dashboard") && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return correlate(NextResponse.redirect(loginUrl));
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return correlate(NextResponse.redirect(new URL(residentHomePath(), request.url)));
    }
    return correlate(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  if (session && isStaffOnlyDashboardPath(pathname)) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return correlate(NextResponse.redirect(new URL(residentHomePath(), request.url)));
    }
  }

  if (session && isStaffOnlyApiPath(pathname)) {
    const role = await resolveSessionRole(session.sub, session.email);
    if (role && isResident(role)) {
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.residentPortalOnly,
        message: "Boende har endast åtkomst till boendeportalen",
        requestId,
      });
    }
  }

  return correlate(
    NextResponse.next({
      request: {
        headers: correlatedRequestHeaders(request.headers, requestId),
      },
    }),
  );
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/api/:path*"],
};
