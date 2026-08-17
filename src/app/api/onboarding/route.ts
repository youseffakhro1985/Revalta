import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { buildOnboardingProgress } from "@/lib/onboarding";
import { getCompanyServicePreferences } from "@/lib/service-notification-settings";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/onboarding" });
const ticketIntakeAction = "onboarding.ticket_intake_verified";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

async function readProgress(companyId: string) {
  const now = new Date();
  const [company, propertyCount, activeTeamMembers, pendingTeamInvites, ticketIntakeVerification, notifications] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { name: true, org_number: true },
    }),
    db.property.count({ where: { company_id: companyId, deleted_at: null } }),
    db.user.count({
      where: {
        company_id: companyId,
        status: "active",
        role: { not: "resident" },
      },
    }),
    db.teamInvite.count({
      where: {
        company_id: companyId,
        accepted_at: null,
        expires_at: { gt: now },
      },
    }),
    db.auditLog.findFirst({
      where: { company_id: companyId, action: ticketIntakeAction },
      orderBy: { created_at: "desc" },
      select: { id: true },
    }),
    getCompanyServicePreferences(companyId),
  ]);

  return buildOnboardingProgress({
    companyConfigured: Boolean(company?.name?.trim() && company.org_number?.trim()),
    propertyCount,
    activeTeamMembers,
    pendingTeamInvites,
    ticketIntakeVerified: Boolean(ticketIntakeVerification),
    notificationSettingsUpdatedAt: notifications.updatedAt?.toISOString() ?? null,
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return noStore({ error: "Organisation saknas" }, { status: 400 });

    if (!canManageCompany(user.role)) {
      return noStore({ eligible: false, progress: null });
    }

    const progress = await readProgress(user.company_id);
    return noStore({ eligible: true, progress });
  } catch (error) {
    logger.error("Get onboarding progress error", error);
    return noStore({ error: "Kunde inte hämta onboardingstatus" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageCompany(user.role)) {
      return noStore({ error: "Du saknar behörighet att verifiera organisationens onboarding" }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    if (body?.action !== "verify-ticket-intake") {
      return noStore({ error: "Ogiltig onboardingåtgärd" }, { status: 400 });
    }

    const propertyCount = await db.property.count({
      where: { company_id: user.company_id, deleted_at: null },
    });
    if (propertyCount === 0) {
      return noStore({ error: "Lägg till minst en fastighet innan felanmälan verifieras" }, { status: 409 });
    }

    const existing = await db.auditLog.findFirst({
      where: { company_id: user.company_id, action: ticketIntakeAction },
      select: { id: true },
    });

    if (!existing) {
      await writeAuditLog(user, {
        entityType: "onboarding",
        entityId: user.company_id,
        action: ticketIntakeAction,
        metadata: { verifiedBy: user.id },
      });
    }

    return noStore({ success: true, progress: await readProgress(user.company_id) });
  } catch (error) {
    logger.error("Update onboarding progress error", error);
    return noStore({ error: "Kunde inte uppdatera onboardingstatus" }, { status: 500 });
  }
}
