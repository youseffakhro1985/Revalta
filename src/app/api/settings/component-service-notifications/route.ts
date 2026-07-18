import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const allowedRoles = ["owner", "admin", "manager", "property_manager"] as const;
type AllowedRole = (typeof allowedRoles)[number];

type Settings = {
  enabled: boolean;
  daysAhead: number;
  roles: AllowedRole[];
  additionalEmails: string[];
};

const defaults: Settings = {
  enabled: true,
  daysAhead: 30,
  roles: [...allowedRoles],
  additionalEmails: [],
};

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseSettings(value: unknown): Settings {
  const payload = record(value);
  if (!payload) return defaults;

  const daysAhead = Number(payload.daysAhead);
  const roles = Array.isArray(payload.roles)
    ? Array.from(new Set(payload.roles.filter((role): role is AllowedRole =>
        typeof role === "string" && allowedRoles.includes(role as AllowedRole),
      )))
    : defaults.roles;
  const additionalEmails = Array.isArray(payload.additionalEmails)
    ? Array.from(new Set(payload.additionalEmails.map(normalizeEmail).filter((email) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      ))).slice(0, 20)
    : [];

  return {
    enabled: payload.enabled !== false,
    daysAhead: Number.isInteger(daysAhead) && daysAhead >= 1 && daysAhead <= 90 ? daysAhead : defaults.daysAhead,
    roles: roles.length ? roles : defaults.roles,
    additionalEmails,
  };
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: noStore({ error: "Obehörig" }, { status: 401 }) } as const;
  if (!user.company_id) return { error: noStore({ error: "Användaren saknar organisation" }, { status: 400 }) } as const;
  if (!canManageCompany(user.role)) return { error: noStore({ error: "Endast ägare och administratörer kan hantera serviceaviseringar" }, { status: 403 }) } as const;
  return { user, companyId: user.company_id } as const;
}

export async function GET() {
  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const [settingsEvent, runs] = await Promise.all([
    db.integrationEvent.findFirst({
      where: { company_id: access.companyId, type: "component_service_settings", status: "active" },
      orderBy: { created_at: "desc" },
      select: { id: true, payload: true, created_at: true },
    }),
    db.integrationEvent.findMany({
      where: { company_id: access.companyId, type: "component_service_digest" },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, status: true, recipient: true, payload: true, created_at: true },
    }),
  ]);

  return noStore({
    settings: parseSettings(settingsEvent?.payload),
    settingsUpdatedAt: settingsEvent?.created_at ?? null,
    latestRun: runs[0] ?? null,
    runs,
  });
}

export async function PATCH(request: Request) {
  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const body = await request.json().catch(() => null);
  const payload = record(body);
  if (!payload) return noStore({ error: "Ogiltigt JSON-underlag" }, { status: 400 });

  const settings = parseSettings(payload);
  if (Array.isArray(payload.additionalEmails)) {
    const submitted = payload.additionalEmails.map(normalizeEmail).filter(Boolean);
    if (submitted.length > 20 || submitted.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return noStore({ error: "Ange högst 20 giltiga e-postadresser" }, { status: 400 });
    }
  }

  const created = await db.$transaction(async (tx) => {
    await tx.integrationEvent.updateMany({
      where: { company_id: access.companyId, type: "component_service_settings", status: "active" },
      data: { status: "superseded" },
    });

    const event = await tx.integrationEvent.create({
      data: {
        company_id: access.companyId,
        type: "component_service_settings",
        status: "active",
        recipient: access.companyId,
        payload: settings,
      },
      select: { id: true, created_at: true },
    });

    await tx.auditLog.create({
      data: {
        company_id: access.companyId,
        actor_user_id: access.user.id,
        entity_type: "company_settings",
        entity_id: access.companyId,
        action: "component_service_notifications.updated",
        metadata: settings,
      },
    });

    return event;
  });

  return noStore({ success: true, settings, updatedAt: created.created_at });
}
