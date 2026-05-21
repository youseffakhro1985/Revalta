import db from "@/lib/db";
import { Prisma } from "@prisma/client";

type IntegrationUser = {
  company_id: string | null;
};

const configured = {
  email: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
  sms: Boolean(process.env.SMS_PROVIDER_API_KEY),
  stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  storage: Boolean(process.env.STORAGE_PROVIDER_KEY),
  ai: Boolean(process.env.AI_PROVIDER_API_KEY),
};

async function recordIntegrationEvent(
  user: IntegrationUser,
  type: string,
  payload: Record<string, unknown>,
  recipient?: string
) {
  const isConfigured = configured[type as keyof typeof configured] ?? false;

  return db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type,
      recipient,
      status: isConfigured ? "queued" : "mocked",
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
    event: "created" | "updated" | "commented";
  }
) {
  return recordIntegrationEvent(user, "email", payload, payload.recipient);
}

export async function queueSmsNotification(
  user: IntegrationUser,
  payload: {
    ticketId: string;
    message: string;
    recipient?: string;
  }
) {
  return recordIntegrationEvent(user, "sms", payload, payload.recipient);
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
