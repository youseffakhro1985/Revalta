import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (pathname.startsWith("/api/") && pathname !== "/api/stripe/webhook" && unsafeMethod) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Otillåtet anrop" }, { status: 403 });
    }
  }

  const token = request.cookies.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (pathname.startsWith("/dashboard") && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/api/:path*"],
};
