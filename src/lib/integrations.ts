import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { allowIntegrationMocks } from "@/lib/runtime-env";
import { hasStorageConfig } from "@/lib/storage";

type IntegrationUser = {
  company_id: string | null;
};

type EmailDelivery = {
  status: "mocked" | "failed" | "sent";
  providerId: string | null;
  reason?: "not_configured" | "provider_rejected" | "provider_unavailable";
  providerStatus?: number;
};

const DELIVERY_TIMEOUT_MS = 12_000;

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM);
}

export function isSmsConfigured(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.SMS_PROVIDER_API_KEY;
  return Boolean(apiKey && (env.SMS_PROVIDER_WEBHOOK_URL || apiKey.startsWith("46elks:")));
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isAiConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.AI_PROVIDER_API_KEY);
}

function isIntegrationConfigured(type: string) {
  switch (type) {
    case "email":
      return isEmailConfigured();
    case "sms":
      return isSmsConfigured();
    case "stripe":
      return isStripeConfigured();
    case "storage":
      return hasStorageConfig();
    case "ai":
      return isAiConfigured();
    default:
      return false;
  }
}

function publicEmailDelivery(delivery: EmailDelivery) {
  return {
    status: delivery.status,
    providerId: delivery.providerId,
    ...(delivery.reason ? { reason: delivery.reason } : {}),
    ...(typeof delivery.providerStatus === "number" ? { providerStatus: delivery.providerStatus } : {}),
  };
}

/** Dev may mock; production records a hard failure instead of pretending delivery succeeded. */
function mockOrFail(): EmailDelivery {
  if (allowIntegrationMocks()) {
    return { status: "mocked", providerId: null };
  }
  return { status: "failed", providerId: null, reason: "not_configured" };
}

async function sendEmail(payload: {
  recipient?: string;
  subject: string;
  text: string;
}): Promise<EmailDelivery> {
  if (!isEmailConfigured() || !payload.recipient) {
    return mockOrFail();
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.EMAIL_PROVIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: payload.recipient,
        subject: payload.subject,
        text: payload.text,
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({})) as { id?: unknown };

    if (!response.ok) {
      return { status: "failed" as const, providerId: null, reason: "provider_rejected", providerStatus: response.status };
    }

    return { status: "sent" as const, providerId: typeof data.id === "string" ? data.id : null };
  } catch {
    return { status: "failed" as const, providerId: null, reason: "provider_unavailable" };
  }
}

async function sendSms(payload: { recipient?: string; message: string }) {
  if (!isSmsConfigured() || !payload.recipient) {
    return mockOrFail();
  }

  if (process.env.SMS_PROVIDER_API_KEY?.startsWith("46elks:")) {
    const [, username, password, from = "Revalta"] = process.env.SMS_PROVIDER_API_KEY.split(":");
    try {
      const response = await fetch(process.env.SMS_PROVIDER_WEBHOOK_URL || "https://api.46elks.com/a1/sms", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from,
          to: payload.recipient,
          message: payload.message,
        }),
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => ({})) as { id?: unknown };

      if (!response.ok) {
        return { status: "failed" as const, providerId: null, reason: "provider_rejected", providerStatus: response.status };
      }

      return { status: "sent" as const, providerId: typeof data.id === "string" ? data.id : null };
    } catch {
      return { status: "failed" as const, providerId: null, reason: "provider_unavailable" };
    }
  }

  try {
    const response = await fetch(process.env.SMS_PROVIDER_WEBHOOK_URL as string, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SMS_PROVIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: payload.recipient,
        message: payload.message,
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({})) as { id?: unknown };

    if (!response.ok) {
      return { status: "failed" as const, providerId: null, reason: "provider_rejected", providerStatus: response.status };
    }

    return { status: "sent" as const, providerId: typeof data.id === "string" ? data.id : null };
  } catch {
    return { status: "failed" as const, providerId: null, reason: "provider_unavailable" };
  }
}

async function recordIntegrationEvent(
  user: IntegrationUser,
  type: string,
  payload: Record<string, unknown>,
  recipient?: string,
  statusOverride?: string
) {
  const isConfigured = isIntegrationConfigured(type);
  const status = statusOverride ?? (isConfigured ? "queued" : allowIntegrationMocks() ? "mocked" : "failed");

  return db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type,
      recipient,
      status,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

export async function queueTicketNotification(
  user: IntegrationUser,
  payload: {
    ticketId: string;
    title: string;
    recipient?: string;
    event: "created" | "updated" | "commented" | "password_reset" | "email_verification";
    /** Optional one-off email copy. It is intentionally never persisted because it may contain a one-time URL/token. */
    emailContent?: {
      subject: string;
      text: string;
    };
  }
) {
  const subjectByEvent = {
    created: `Ärende mottaget: ${payload.title}`,
    updated: `Ärende uppdaterat: ${payload.title}`,
    commented: `Ny kommentar: ${payload.title}`,
    password_reset: "Återställ ditt lösenord i Revalta",
    email_verification: "Verifiera din e-postadress i Revalta",
  };
  const { emailContent, ...eventPayload } = payload;
  const delivery = await sendEmail({
    recipient: payload.recipient,
    subject: emailContent?.subject ?? subjectByEvent[payload.event],
    text: emailContent?.text ?? `Hej!\n\n${subjectByEvent[payload.event]}\n\nLogga in i Revalta eller följ ärendet via boendeportalen för mer information.\n\nVänliga hälsningar,\nRevalta`,
  });

  return recordIntegrationEvent(
    user,
    "email",
    { ...eventPayload, delivery: publicEmailDelivery(delivery) },
    payload.recipient,
    delivery.status
  );
}

export async function queueEmailVerification(
  user: IntegrationUser,
  payload: {
    recipient: string;
    verificationUrl: string;
  },
) {
  const delivery = await sendEmail({
    recipient: payload.recipient,
    subject: "Verifiera din e-postadress i Revalta",
    text: [
      "Hej!",
      "",
      "Verifiera din e-postadress för att slutföra registreringen i Revalta.",
      "",
      payload.verificationUrl,
      "",
      "Länken gäller i 24 timmar och kan bara användas en gång.",
      "Om du inte skapade kontot kan du bortse från meddelandet.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  });

  return recordIntegrationEvent(
    user,
    "email",
    {
      event: "email_verification",
      delivery: publicEmailDelivery(delivery),
    },
    payload.recipient,
    delivery.status,
  );
}

export async function queueSmsNotification(
  user: IntegrationUser,
  payload: {
    ticketId: string;
    message: string;
    recipient?: string;
  }
) {
  const delivery = await sendSms({ recipient: payload.recipient, message: payload.message });
  return recordIntegrationEvent(user, "sms", { ...payload, delivery }, payload.recipient, delivery.status);
}

export async function recordPaymentEvent(user: IntegrationUser, payload: Record<string, unknown>) {
  const mode = typeof payload.mode === "string" ? payload.mode : "";
  const status = mode.includes("mock") || mode === "plan_change"
    ? mockOrFail().status
    : "completed";
  return recordIntegrationEvent(user, "stripe", payload, undefined, status);
}

export async function recordStorageEvent(user: IntegrationUser, payload: Record<string, unknown>) {
  return recordIntegrationEvent(user, "storage", payload, undefined, "completed");
}

export async function recordAiEvent(user: IntegrationUser, payload: Record<string, unknown>) {
  const source = typeof payload.source === "string" ? payload.source : "";
  const status = source === "provider" || source === "staff" || source === ""
    ? "completed"
    : "fallback";
  return recordIntegrationEvent(user, "ai", payload, undefined, status);
}
