import { NextResponse } from "next/server";
import { createRouteObservability } from "@/lib/route-observability";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/session-policy";

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/logout");
  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache", "storage"' } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  observability.logger.info("auth logout completed", observability.elapsed({
    event: "auth.logout.completed",
  }));
  return observability.correlate(response);
}
