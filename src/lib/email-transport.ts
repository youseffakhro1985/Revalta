export type EmailProviderName = "resend" | "postmark";

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

export type EmailTransportAttempt = {
  provider: EmailProviderName;
  ok: boolean;
  status: number | null;
  retryable: boolean;
  response: string | null;
  error: string | null;
};

export type EmailTransportResult = {
  status: "sent" | "failed";
  provider: EmailProviderName | null;
  attempts: EmailTransportAttempt[];
  retryable: boolean;
  response: string | null;
  error: string | null;
};

const REQUEST_TIMEOUT_MS = 12_000;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);

function retryableStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function providerOrder(): EmailProviderName[] {
  const configured = process.env.EMAIL_PROVIDER_ORDER
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is EmailProviderName => value === "resend" || value === "postmark");

  return configured?.length ? Array.from(new Set(configured)) : ["resend", "postmark"];
}

function providerConfigured(provider: EmailProviderName) {
  return provider === "resend"
    ? Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY)
    : Boolean(process.env.POSTMARK_SERVER_TOKEN);
}

async function sendWithResend(message: EmailMessage): Promise<EmailTransportAttempt> {
  const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY;
  if (!apiKey) {
    return { provider: "resend", ok: false, status: null, retryable: false, response: null, error: "Resend är inte konfigurerad" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    return {
      provider: "resend",
      ok: response.ok,
      status: response.status,
      retryable: !response.ok && retryableStatus(response.status),
      response: body.slice(0, 1000) || null,
      error: response.ok ? null : `Resend svarade ${response.status}: ${body.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      provider: "resend",
      ok: false,
      status: null,
      retryable: true,
      response: null,
      error: error instanceof Error ? error.message : "Okänt Resend-fel",
    };
  }
}

async function sendWithPostmark(message: EmailMessage): Promise<EmailTransportAttempt> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    return { provider: "postmark", ok: false, status: null, retryable: false, response: null, error: "Postmark är inte konfigurerad" };
  }

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ From: message.from, To: message.to, Subject: message.subject, HtmlBody: message.html, MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    return {
      provider: "postmark",
      ok: response.ok,
      status: response.status,
      retryable: !response.ok && retryableStatus(response.status),
      response: body.slice(0, 1000) || null,
      error: response.ok ? null : `Postmark svarade ${response.status}: ${body.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      provider: "postmark",
      ok: false,
      status: null,
      retryable: true,
      response: null,
      error: error instanceof Error ? error.message : "Okänt Postmark-fel",
    };
  }
}

export function emailTransportStatus() {
  return providerOrder().map((provider) => ({ provider, configured: providerConfigured(provider) }));
}

export async function sendTransactionalEmail(message: EmailMessage): Promise<EmailTransportResult> {
  const attempts: EmailTransportAttempt[] = [];
  const configured = providerOrder().filter(providerConfigured);

  if (!configured.length) {
    return { status: "failed", provider: null, attempts, retryable: false, response: null, error: "Ingen e-postleverantör är konfigurerad" };
  }

  for (const provider of configured) {
    const attempt = provider === "resend" ? await sendWithResend(message) : await sendWithPostmark(message);
    attempts.push(attempt);
    if (attempt.ok) {
      return { status: "sent", provider, attempts, retryable: false, response: attempt.response, error: null };
    }
    if (!attempt.retryable) break;
  }

  const last = attempts.at(-1) || null;
  return {
    status: "failed",
    provider: last?.provider || null,
    attempts,
    retryable: attempts.some((attempt) => attempt.retryable),
    response: last?.response || null,
    error: last?.error || "E-postleveransen misslyckades",
  };
}
