import { sendTransactionalEmail, type EmailProviderName, type EmailTransportAttempt } from "@/lib/email-transport";

type DueComponent = {
  id: string;
  property_id: string;
  component_name: string;
  next_service_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
};

export type ServiceEmailDelivery = {
  email: string;
  mode: "all" | "overdue_only";
  status: "sent" | "failed";
  provider: EmailProviderName | null;
  providerAttempts: EmailTransportAttempt[];
  providerResponse: string | null;
  error: string | null;
  attempts: number;
  retryable: boolean;
};

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 400;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : "https://www.revalta.se";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeZone: "Europe/Stockholm",
  }).format(value);
}

function emailHtml(components: DueComponent[], daysAhead: number, overdueOnly: boolean) {
  const now = new Date();
  const overdue = components.filter((item) => item.next_service_at < now).length;
  const rows = components.map((item) => {
    const isOverdue = item.next_service_at < now;
    const href = `${appBaseUrl()}/dashboard/fastigheter/${item.property_id}/komponenter/${item.id}`;
    return `<tr><td style="padding:12px;border-bottom:1px solid #e7e1d7"><a href="${escapeHtml(href)}" style="color:#174d45;font-weight:700;text-decoration:none">${escapeHtml(item.component_name)}</a><div style="margin-top:4px;color:#6d6a63;font-size:13px">${escapeHtml(item.property_name)} · ${escapeHtml(item.property_address)}, ${escapeHtml(item.property_city)}</div></td><td style="padding:12px;border-bottom:1px solid #e7e1d7">${escapeHtml(formatDate(item.next_service_at))}</td><td style="padding:12px;border-bottom:1px solid #e7e1d7">${isOverdue ? "Förfallen" : "Kommande"}</td></tr>`;
  }).join("");
  const intro = overdueOnly
    ? `Det finns ${components.length} förfallna servicepunkter som kräver uppföljning.`
    : `Det finns ${components.length} komponenter med service inom ${daysAhead} dagar. ${overdue} är förfallna.`;
  return `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:760px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e7e1d7;border-radius:18px;overflow:hidden"><div style="padding:28px 30px;background:#174d45;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:26px">Serviceöversikt</h1></div><div style="padding:28px 30px"><p style="line-height:1.6;color:#514e48">${intro}</p><table style="width:100%;border-collapse:collapse;margin-top:20px"><tbody>${rows}</tbody></table><p style="margin:26px 0 0"><a href="${appBaseUrl()}/dashboard/fastigheter" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna Revalta</a></p></div></div></div></body></html>`;
}

function retryDelay(attempt: number) {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return exponential + Math.floor(Math.random() * 200);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverServiceEmail(
  email: string,
  components: DueComponent[],
  daysAhead: number,
  mode: ServiceEmailDelivery["mode"],
): Promise<ServiceEmailDelivery> {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    return {
      email,
      mode,
      status: "failed",
      provider: null,
      providerAttempts: [],
      providerResponse: null,
      error: "EMAIL_FROM är inte konfigurerad",
      attempts: 0,
      retryable: false,
    };
  }

  const overdue = components.filter((item) => item.next_service_at < new Date()).length;
  const message = {
    from,
    to: email,
    subject: mode === "overdue_only" || overdue > 0
      ? `Revalta: ${overdue} förfallna servicepunkter`
      : "Revalta: kommande service",
    html: emailHtml(components, daysAhead, mode === "overdue_only"),
  };

  let lastResult = await sendTransactionalEmail(message);
  let attempts = 1;

  while (lastResult.status === "failed" && lastResult.retryable && attempts < MAX_ATTEMPTS) {
    await wait(retryDelay(attempts));
    attempts += 1;
    lastResult = await sendTransactionalEmail(message);
  }

  return {
    email,
    mode,
    status: lastResult.status,
    provider: lastResult.provider,
    providerAttempts: lastResult.attempts,
    providerResponse: lastResult.response,
    error: lastResult.error,
    attempts,
    retryable: lastResult.retryable,
  };
}
