import db from "@/lib/db";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { hasStorageConfig } from "@/lib/storage";
import { NextResponse } from "next/server";

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

    const events = await db.integrationEvent.findMany({
      where: user.company_id ? { company_id: user.company_id } : undefined,
      orderBy: { created_at: "desc" },
      take: 50,
    });

    const invoiceExportEvents = events.filter((event) => event.type === "work_order.invoice_integration_job");
    const invoiceExportSummary = {
      total: invoiceExportEvents.length,
      active: invoiceExportEvents.filter((event) => event.status === "queued" || event.status === "processing").length,
      failed: invoiceExportEvents.filter((event) => event.status === "failed").length,
      sent: invoiceExportEvents.filter((event) => event.status === "sent").length,
    };

    return NextResponse.json(
      { integrations, events, invoiceExportSummary },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Get integrations error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
