import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ module: "demo-request-email" });

export type DemoRequest = {
  name: string;
  email: string;
  company: string;
  phone: string | null;
  role: string | null;
  portfolio: string | null;
  message: string | null;
};

export type DemoDeliveryResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "provider_error" };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function row(label: string, value: string | null) {
  if (!value) return "";
  return `<tr><td style="padding:8px 12px;color:#6d6a63;vertical-align:top;width:150px">${escapeHtml(label)}</td><td style="padding:8px 12px;color:#22201d;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

function demoRequestHtml(input: DemoRequest) {
  return `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:720px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e7e1d7;border-radius:18px;overflow:hidden"><div style="padding:28px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.8">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Ny demoförfrågan</h1></div><div style="padding:24px 20px"><table style="width:100%;border-collapse:collapse"><tbody>${row("Namn", input.name)}${row("E-post", input.email)}${row("Företag", input.company)}${row("Telefon", input.phone)}${row("Roll", input.role)}${row("Bestånd", input.portfolio)}${row("Meddelande", input.message)}</tbody></table></div></div></div></body></html>`;
}

export async function deliverDemoRequest(input: DemoRequest): Promise<DemoDeliveryResult> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const to = process.env.DEMO_REQUEST_TO?.trim();

  if (!apiKey || !from || !to) {
    logger.warn("Demo request email is not configured", {
      hasProviderKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      hasRecipient: Boolean(to),
    });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: input.email,
        subject: `Demoförfrågan: ${input.company}`,
        html: demoRequestHtml(input),
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      logger.error("Demo request provider rejected delivery", {
        status: response.status,
      });
      return { ok: false, reason: "provider_error" };
    }

    return { ok: true };
  } catch (error) {
    logger.error("Demo request delivery failed", error);
    return { ok: false, reason: "provider_error" };
  }
}
