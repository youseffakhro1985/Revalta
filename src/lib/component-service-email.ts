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
  providerResponse: string | null;
  error: string | null;
  attempts: number;
  retryable: boolean;
};

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 12_000;
const BASE_RETRY_DELAY_MS = 400;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);

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

function retryableStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function retryDelay(attempt: number) {
  const exponential = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 200);
  return exponential + jitter;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return "E-postleverantören svarade inte inom tidsgränsen";
  return error instanceof Error ? error.message : "Okänt fel";
}

export async function deliverServiceEmail(
  email: string,
  components: DueComponent[],
  daysAhead: number,
  mode: ServiceEmailDelivery["mode"],
): Promise<ServiceEmailDelivery> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      email,
      mode,
      status: "failed",
      providerResponse: null,
      error: "E-postleverantören är inte konfigurerad",
      attempts: 0,
      retryable: false,
    };
  }

  const overdue = components.filter((item) => item.next_service_at < new Date()).length;
  const requestBody = JSON.stringify({
    from,
    to: [email],
    subject: mode === "overdue_only" || overdue > 0 ? `Revalta: ${overdue} förfallna servicepunkter` : "Revalta: kommande service",
    html: emailHtml(components, daysAhead, mode === "overdue_only"),
  });

  let lastError = "Okänt fel";
  let wasRetryable = true;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: requestBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.text();

      if (response.ok) {
        return {
          email,
          mode,
          status: "sent",
          providerResponse: body.slice(0, 1000),
          error: null,
          attempts: attempt,
          retryable: false,
        };
      }

      wasRetryable = retryableStatus(response.status);
      lastError = `E-postleverantören svarade ${response.status}: ${body.slice(0, 300)}`;
    } catch (error) {
      wasRetryable = true;
      lastError = errorMessage(error);
    }

    if (!wasRetryable || attempt === MAX_ATTEMPTS) break;
    await wait(retryDelay(attempt));
  }

  return {
    email,
    mode,
    status: "failed",
    providerResponse: null,
    error: lastError,
    attempts: MAX_ATTEMPTS,
    retryable: wasRetryable,
  };
}
