import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("revalta_session")?.value;
  const pathname = request.nextUrl.pathname;

  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  let session = null;
  if (token) {
    session = await decrypt(token);
  }

  // Om inloggad, blockera från att besöka login/register
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Oskyddade rutter eller icke inloggad
  if (!isDashboard && !isAdmin) {
    return NextResponse.next();
  }

  // Skyddade rutter utan giltig session
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Blockera konton/företag som är spärrade (snabb koll i edge via JWT)
  if (session.status === "blocked" || session.status === "deleted") {
    return NextResponse.redirect(new URL("/login?error=blocked", request.url));
  }
  
  if (session.companyStatus === "blocked" || session.companyStatus === "deleted") {
    return NextResponse.redirect(new URL("/login?error=company_blocked", request.url));
  }

  // RBAC: Endast super_owner / internal_admin får nå /admin
  if (isAdmin) {
    if (session.role !== "super_owner" && session.role !== "internal_admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Dashboard kräver företag (förutom för system admins)
  if (isDashboard) {
    if (session.role !== "super_owner" && session.role !== "internal_admin" && !session.companyId) {
      // De har inget aktivt företag, styr till onboarding
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
