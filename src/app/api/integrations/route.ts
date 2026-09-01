import db from "@/lib/db";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { hasStorageConfig } from "@/lib/storage";
import { isStripeBillingReady } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/integrations" });

const requiredEnv: Record<string, string[]> = {
  email: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM"],
  demo_leads: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM", "DEMO_REQUEST_TO"],
  sms: ["SMS_PROVIDER_API_KEY", "SMS_PROVIDER_WEBHOOK_URL"],
  stripe: [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_START",
    "STRIPE_PRICE_PROFESSIONAL",
    "STRIPE_PRICE_ENTERPRISE",
  ],
  // BLOB_READ_WRITE_TOKEN is preferred. STORAGE_PROVIDER_KEY remains an
  // accepted legacy fallback until the modern-storage cutover is complete.
  storage: ["BLOB_READ_WRITE_TOKEN", "STORAGE_PROVIDER_KEY"],
  ai: ["AI_PROVIDER_API_KEY"],
  fortnox: ["FORTNOX_ACCESS_TOKEN", "FORTNOX_INVOICE_ENDPOINT"],
  visma: ["VISMA_ACCESS_TOKEN", "VISMA_INVOICE_ENDPOINT"],
  invoice_webhook: ["INVOICE_WEBHOOK_URL", "INVOICE_WEBHOOK_SECRET"],
};

function hasEnv(key: string) {
  return Boolean(process.env[key]?.trim());
}

function isIntegrationConfigured(type: string, envKeys: string[]) {
  if (type === "storage") return hasStorageConfig();
  if (type === "stripe") return isStripeBillingReady();
  return envKeys.every(hasEnv);
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageIntegrations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa integrationer" }, { status: 403 });
    }

    const integrations = Object.entries(requiredEnv).map(([type, envKeys]) => ({
      type,
      configured: isIntegrationConfigured(type, envKeys),
      requiredEnv: envKeys,
    }));

    const companyFilter = user.company_id ? { company_id: user.company_id } : { company_id: "__no_company_scope__" };

    const [events, invoiceJobCounts] = await Promise.all([
      db.integrationEvent.findMany({
        where: companyFilter,
        orderBy: { created_at: "desc" },
        take: 50,
      }),
      // Aggregate status counts in the database instead of fetching every
      // invoice export job row ever created for the company (unbounded growth
      // risk over the company's lifetime) just to count them in JS.
      user.company_id
        ? db.workOrderInvoiceExportJob.groupBy({
            by: ["status"],
            where: { company_id: user.company_id },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    ]);

    const countFor = (status: string) =>
      invoiceJobCounts.find((row) => row.status === status)?._count._all ?? 0;
    const invoiceExportSummary = {
      total: invoiceJobCounts.reduce((sum, row) => sum + row._count._all, 0),
      active: countFor("queued") + countFor("processing"),
      failed: countFor("failed"),
      sent: countFor("sent"),
    };

    return NextResponse.json(
      { integrations, events, invoiceExportSummary },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error("Get integrations error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
