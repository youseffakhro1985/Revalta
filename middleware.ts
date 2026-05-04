import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/logga-in", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    const isAdmin = session.role === "super_owner" || session.role === "internal_admin";
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
