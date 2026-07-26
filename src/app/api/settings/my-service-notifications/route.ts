import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import {
  getUserServicePreferences,
  upsertUserServicePreferences,
  type UserServicePreferences,
} from "@/lib/service-notification-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const stored = await getUserServicePreferences(user.company_id, user.id);
  return NextResponse.json({
    preferences: stored.preferences,
    updatedAt: stored.updatedAt,
    email: user.email,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });

  const next: UserServicePreferences = {
    enabled: body.enabled !== false,
    overdueOnly: body.overdueOnly === true,
  };

  const previous = await getUserServicePreferences(user.company_id, user.id);
  await db.$transaction(async (tx) => {
    await upsertUserServicePreferences(user.company_id!, user.id, next, tx);
    await tx.auditLog.create({
      data: {
        company_id: user.company_id!,
        actor_user_id: user.id,
        entity_type: "user_service_notification_preferences",
        entity_id: user.id,
        action: "update",
        metadata: { previous: previous.preferences, next, storage: "UserServiceNotificationPreference" },
      },
    });
  });

  return NextResponse.json({ preferences: next, message: "Dina aviseringsval är sparade." });
}
