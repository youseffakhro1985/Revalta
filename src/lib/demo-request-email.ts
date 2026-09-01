import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ component: "demo-request-email" });
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DELIVERY_TIMEOUT_MS = 12_000;

export type DemoRequest = {
  name: string;
  email: string;
  company: string;
  phone: string;
  role: string;
  portfolio: string;
  message: string;
};

export type DemoDeliveryResult =
  | { ok: true; providerId: string | null }
  | { ok: false; reason: "not_configured" | "provider_error" | "timeout" };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function line(label: string, value: string) {
  if (!value) return "";
  return `<tr><td style="padding:8px 12px;color:#6a665f;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 12px;color:#22201d;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

export function demoRequestEmailHtml(request: DemoRequest) {
  const message = request.message
    ? `<div style="margin-top:22px;padding:16px;border-radius:12px;background:#f6f3ed;color:#38342f;white-space:pre-wrap;line-height:1.6">${escapeHtml(request.message)}</div>`
    : "";
  return `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:720px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.82">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Ny demoförfrågan</h1></div><div style="padding:26px 30px"><table style="width:100%;border-collapse:collapse"><tbody>${line("Namn", request.name)}${line("E-post", request.email)}${line("Företag", request.company)}${line("Telefon", request.phone)}${line("Roll", request.role)}${line("Bestånd", request.portfolio)}</tbody></table>${message}</div></div></div></body></html>`;
}

export async function deliverDemoRequest(request: DemoRequest): Promise<DemoDeliveryResult> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const to = process.env.DEMO_REQUEST_TO?.trim();
  if (!apiKey || !from || !to) {
    logger.warn("demo request email is not configured", {
      event: "demo_request.delivery.not_configured",
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      hasRecipient: Boolean(to),
    });
    return { ok: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: request.email,
        subject: `Revalta demo · ${request.company}`,
        html: demoRequestEmailHtml(request),
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      logger.error("demo request provider rejected delivery", undefined, {
        event: "demo_request.delivery.provider_error",
        providerStatus: response.status,
        providerBodyLength: body.length,
      });
      return { ok: false, reason: "provider_error" };
    }
    let providerId: string | null = null;
    try {
      const parsed = JSON.parse(body) as { id?: unknown };
      providerId = typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      providerId = null;
    }
    logger.info("demo request delivered", {
      event: "demo_request.delivery.sent",
      providerStatus: response.status,
      hasProviderId: Boolean(providerId),
    });
    return { ok: true, providerId };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    logger.error("demo request delivery failed", error, {
      event: timedOut ? "demo_request.delivery.timeout" : "demo_request.delivery.failed",
    });
    return { ok: false, reason: timedOut ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timeout);
  }
}
