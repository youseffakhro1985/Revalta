import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { Prisma } from "@prisma/client";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

export class PasswordResetDeliveryError extends Error {
  reason: "not_configured" | "provider_rejected" | "provider_unavailable";
  providerStatus?: number;
  providerCode?: string;

  constructor(
    reason: "not_configured" | "provider_rejected" | "provider_unavailable",
    extras?: { providerStatus?: number; providerCode?: string },
  ) {
    super("Password reset email delivery failed");
    this.name = "PasswordResetDeliveryError";
    this.reason = reason;
    this.providerStatus = extras?.providerStatus;
    this.providerCode = extras?.providerCode;
  }
}

type ResetDelivery = {
  status: "sent" | "failed";
  providerId: string | null;
  reason?: "not_configured" | "provider_rejected" | "provider_unavailable";
  providerStatus?: number;
  providerCode?: string;
};

function publicResetDelivery(delivery: ResetDelivery) {
  return {
    status: delivery.status,
    providerId: delivery.providerId,
    ...(delivery.reason ? { reason: delivery.reason } : {}),
    ...(typeof delivery.providerStatus === "number" ? { providerStatus: delivery.providerStatus } : {}),
    ...(delivery.providerCode ? { providerCode: delivery.providerCode } : {}),
  };
}

async function recordResetDelivery(recipient: string, delivery: ResetDelivery) {
  await db.integrationEvent.create({
    data: {
      company_id: null,
      type: "email",
      recipient,
      status: delivery.status,
      payload: {
        event: "password_reset",
        delivery: publicResetDelivery(delivery),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const delivery: ResetDelivery = { status: "failed", providerId: null, reason: "not_configured" };
    await recordResetDelivery(email, delivery);
    throw new PasswordResetDeliveryError("not_configured");
  }

  const resetUrl = `${getPublicAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Återställ ditt lösenord i Revalta",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>Återställ lösenord</h1><p>Vi har fått en begäran om att återställa lösenordet för ditt Revalta-konto.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#174f4a;color:#fff;text-decoration:none;border-radius:8px">Välj nytt lösenord</a></p><p>Länken gäller i 30 minuter och kan bara användas en gång.</p><p>Ignorera meddelandet om du inte begärde detta.</p></div>`,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => ({})) as { id?: unknown; name?: unknown };

    if (!response.ok) {
      const providerCode = typeof data.name === "string" ? data.name.slice(0, 80) : undefined;
      const delivery: ResetDelivery = {
        status: "failed",
        providerId: null,
        reason: "provider_rejected",
        providerStatus: response.status,
        providerCode,
      };
      await recordResetDelivery(email, delivery);
      throw new PasswordResetDeliveryError("provider_rejected", {
        providerStatus: response.status,
        providerCode,
      });
    }

    await recordResetDelivery(email, {
      status: "sent",
      providerId: typeof data.id === "string" ? data.id : null,
    });
  } catch (error) {
    if (error instanceof PasswordResetDeliveryError) throw error;
    const delivery: ResetDelivery = { status: "failed", providerId: null, reason: "provider_unavailable" };
    await recordResetDelivery(email, delivery);
    throw new PasswordResetDeliveryError("provider_unavailable");
  }
}
