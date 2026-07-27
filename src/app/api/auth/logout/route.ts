import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-correlation";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/session-policy";
import { createLogger } from "@/lib/structured-logger";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Clear-Site-Data": '"cache", "storage"',
} as const;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/auth/logout",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  const response = NextResponse.json(
    { success: true, requestId },
    {
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        [REQUEST_ID_HEADER]: requestId,
      },
    },
  );

  response.cookies.set(SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

  logger.info("auth logout completed", {
    eventCode: "auth.logout.completed",
    status: 200,
    latencyMs: Date.now() - startedAt,
  });

  return response;
}
