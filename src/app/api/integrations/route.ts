import db from "@/lib/db";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { hasStorageConfig } from "@/lib/storage";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/integrations" });

const requiredEnv: Record<string, string[]> = {
  email: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM"],
  sms: ["SMS_PROVIDER_API_KEY", "SMS_PROVIDER_WEBHOOK_URL"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  storage: ["BLOB_READ_WRITE_TOKEN"],
  ai: ["AI_PROVIDER_API_KEY"],
  fortnox: ["FORTNOX_ACCESS_TOKEN", "FORTNOX_INVOICE_ENDPOINT"],
  visma: ["VISMA_ACCESS_TOKEN", "VISMA_INVOICE_ENDPOINT"],
  invoice_webhook: ["INVOICE_WEBHOOK_URL", "INVOICE_WEBHOOK_SECRET"],
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageIntegrations(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa integrationer" }, { status: 403 });
    }

    const integrations = Object.entries(requiredEnv).map(([type, envKeys]) => ({
      type,
      configured: type === "storage" ? hasStorageConfig() : envKeys.every((key) => Boolean(process.env[key])),
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
