import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type PersonalPreferences = {
  enabled: boolean;
  overdueOnly: boolean;
};

const defaults: PersonalPreferences = { enabled: true, overdueOnly: false };

function parsePreferences(payload: unknown): PersonalPreferences {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return defaults;
  const value = payload as Record<string, unknown>;
  return {
    enabled: value.enabled !== false,
    overdueOnly: value.overdueOnly === true,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const latest = await db.integrationEvent.findFirst({
    where: {
      company_id: user.company_id,
      type: "user_service_notification_preferences",
      status: "active",
      recipient: user.id,
    },
    orderBy: { created_at: "desc" },
    select: { payload: true, created_at: true },
  });

  return NextResponse.json({
    preferences: parsePreferences(latest?.payload),
    updatedAt: latest?.created_at ?? null,
    email: user.email,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });

  const next: PersonalPreferences = {
    enabled: body.enabled !== false,
    overdueOnly: body.overdueOnly === true,
  };

  const previousEvent = await db.integrationEvent.findFirst({
    where: {
      company_id: user.company_id,
      type: "user_service_notification_preferences",
      status: "active",
      recipient: user.id,
    },
    orderBy: { created_at: "desc" },
    select: { payload: true },
  });
  const previous = parsePreferences(previousEvent?.payload);

  await db.$transaction([
    db.integrationEvent.create({
      data: {
        company_id: user.company_id,
        type: "user_service_notification_preferences",
        status: "active",
        recipient: user.id,
        payload: { ...next, email: user.email, updatedBy: user.id },
      },
    }),
    db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "user_service_notification_preferences",
        entity_id: user.id,
        action: "update",
        metadata: { previous, next },
      },
    }),
  ]);

  return NextResponse.json({ preferences: next, message: "Dina aviseringsval är sparade." });
}
