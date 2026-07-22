import { NextResponse } from "next/server";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
} from "@/lib/session-policy";

export async function POST() {
  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache", "storage"' } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  return response;
}
