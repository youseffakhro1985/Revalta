import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getPublicAppUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/current-user";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/settings/profile" });
const ACCOUNT_PATH = "/dashboard/boendeportal/konto";

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readProfileName(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return String(form?.get("name") || "");
  }
  const body = await request.json().catch(() => ({})) as { name?: unknown };
  return typeof body.name === "string" ? body.name : "";
}

function nativeRedirect(request: Request, search: string) {
  const response = NextResponse.redirect(new URL(`${ACCOUNT_PATH}${search}`, getPublicAppUrl(request.url)), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    return NextResponse.json({ user });
  } catch (error) {
    logger.error("Get profile settings error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

async function saveProfile(request: Request, nativeForm: boolean) {
  const user = await getCurrentUser();
  if (!user) {
    if (nativeForm) {
      const response = NextResponse.redirect(new URL("/login", getPublicAppUrl(request.url)), 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }
    return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  }

  const name = await readProfileName(request);
  const normalizedName = name.trim() ? name.trim() : null;
  if ((normalizedName?.length ?? 0) > 120) {
    if (nativeForm) return nativeRedirect(request, "?reason=invalid");
    return NextResponse.json({ error: "Namnet får vara högst 120 tecken" }, { status: 400 });
  }

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: { name: normalizedName },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      email_verified_at: true,
    },
  });

  await writeAuditLog(user, {
    entityType: "user",
    entityId: user.id,
    action: "settings.profile_updated",
    metadata: { name: normalizedName },
  });

  if (nativeForm) return nativeRedirect(request, "?saved=1");
  return NextResponse.json({ success: true, user: updatedUser });
}

export async function PATCH(request: Request) {
  try {
    return await saveProfile(request, false);
  } catch (error) {
    logger.error("Update profile settings error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const nativeForm = isNativeFormPost(request);
  try {
    return await saveProfile(request, nativeForm);
  } catch (error) {
    logger.error("Update profile settings error", error);
    if (nativeForm) return nativeRedirect(request, "?reason=error");
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
