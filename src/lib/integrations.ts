import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { hasStorageConfig } from "@/lib/storage";

type IntegrationUser = {
  company_id: string | null;
};

const configured = {
  email: Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM),
  sms: Boolean(process.env.SMS_PROVIDER_API_KEY && (process.env.SMS_PROVIDER_WEBHOOK_URL || process.env.SMS_PROVIDER_API_KEY.startsWith("46elks:"))),
  stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  storage: hasStorageConfig(),
  ai: Boolean(process.env.AI_PROVIDER_API_KEY),
};

async function sendEmail(payload: {
  recipient?: string;
  subject: string;
  text: string;
}) {
  if (!configured.email || !payload.recipient) {
    return { status: "mocked", providerId: null };
  }

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
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { status: "failed", providerId: null, providerResponse: data };
  }

  return { status: "sent", providerId: typeof data.id === "string" ? data.id : null, providerResponse: data };
}

async function sendSms(payload: { recipient?: string; message: string }) {
  if (!configured.sms || !payload.recipient) {
    return { status: "mocked", providerId: null };
  }

  if (process.env.SMS_PROVIDER_API_KEY?.startsWith("46elks:")) {
    const [, username, password, from = "Revalta"] = process.env.SMS_PROVIDER_API_KEY.split(":");
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
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { status: "failed", providerId: null, providerResponse: data };
    }

    return { status: "sent", providerId: typeof data.id === "string" ? data.id : null, providerResponse: data };
  }

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
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { status: "failed", providerId: null, providerResponse: data };
  }

  return { status: "sent", providerId: typeof data.id === "string" ? data.id : null, providerResponse: data };
}

async function recordIntegrationEvent(
  user: IntegrationUser,
  type: string,
  payload: Record<string, unknown>,
  recipient?: string,
  statusOverride?: string
) {
  const isConfigured = configured[type as keyof typeof configured] ?? false;

  return db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type,
      recipient,
      status: statusOverride ?? (isConfigured ? "queued" : "mocked"),
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
  }
) {
  const subjectByEvent = {
    created: `Ärende mottaget: ${payload.title}`,
    updated: `Ärende uppdaterat: ${payload.title}`,
    commented: `Ny kommentar: ${payload.title}`,
    password_reset: "Återställ ditt lösenord i Revalta",
    email_verification: "Verifiera din e-postadress i Revalta",
  };
  const delivery = await sendEmail({
    recipient: payload.recipient,
    subject: subjectByEvent[payload.event],
    text: `Hej!\n\n${subjectByEvent[payload.event]}\n\nLogga in i Revalta eller följ ärendet via boendeportalen för mer information.\n\nVänliga hälsningar,\nRevalta`,
  });

  return recordIntegrationEvent(
    user,
    "email",
    { ...payload, delivery },
    payload.recipient,
    delivery.status
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
  return recordIntegrationEvent(user, "stripe", payload);
}

export async function recordStorageEvent(user: IntegrationUser, payload: Record<string, unknown>) {
  return recordIntegrationEvent(user, "storage", payload);
}

export async function recordAiEvent(user: IntegrationUser, payload: Record<string, unknown>) {
  return recordIntegrationEvent(user, "ai", payload);
}
