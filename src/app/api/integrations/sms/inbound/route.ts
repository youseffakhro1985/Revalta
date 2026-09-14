import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/integrations/sms/inbound" });
const PUBLIC_REFERENCE = /\bRV-\d{4}-[A-Z0-9]+\b/i;
const OPEN_TICKET_STATUSES = new Set(["new", "received", "in_progress", "waiting"]);

function secretsEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function inboundSecret() {
  return process.env.SMS_PROVIDER_WEBHOOK_SECRET?.trim() || "";
}

function providedSecret(request: Request) {
  const header = request.headers.get("x-revalta-sms-secret")?.trim() || "";
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get("token")?.trim() || "";
  } catch {
    return "";
  }
}

function isAuthorized(request: Request) {
  const expected = inboundSecret();
  const provided = providedSecret(request);
  return Boolean(expected && provided) && secretsEqual(provided, expected);
}

function readField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  }
  const text = await request.text().catch(() => "");
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries()) as Record<string, unknown>;
}

export function swedishPhoneVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed ? [trimmed] : [];

  let national = digits;
  if (national.startsWith("0046") && national.length >= 12) {
    national = `0${national.slice(4)}`;
  } else if (national.startsWith("46") && national.length >= 10) {
    national = `0${national.slice(2)}`;
  } else if (!national.startsWith("0") && national.length === 9) {
    national = `0${national}`;
  }

  const rest = national.startsWith("0") ? national.slice(1) : national;
  return [...new Set([
    trimmed,
    digits,
    national,
    rest,
    `46${rest}`,
    `+46${rest}`,
    `0046${rest}`,
  ].filter(Boolean))];
}

type PhoneTicket = {
  id: string;
  company_id: string;
  user_id: string;
  status: string;
};

function pickTenantSafeTicket(tickets: Array<{ id: string; company_id: string | null; user_id: string; status: string }>) {
  const scoped = tickets.filter((ticket): ticket is PhoneTicket => Boolean(ticket.company_id));
  const companyIds = new Set(scoped.map((ticket) => ticket.company_id));
  if (scoped.length === 0 || companyIds.size !== 1) return null;
  const open = scoped.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status));
  return open[0] || scoped[0] || null;
}

async function attachResidentComment(ticket: { id: string; user_id: string }, from: string, message: string) {
  await db.ticketComment.create({
    data: {
      ticket_id: ticket.id,
      user_id: ticket.user_id,
      body: message || `Inkommande SMS från ${from || "okänt nummer"}`,
      is_internal: false,
      author_type: "resident",
      author_name: from || "SMS",
    },
  });
}

export async function POST(request: Request) {
  try {
    if (!inboundSecret()) {
      return NextResponse.json({ error: "SMS-inkommande är inte konfigurerat" }, { status: 503 });
    }
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    }

    const payload = await parsePayload(request);
    const from = readField(payload, ["from", "sender", "msisdn"]).slice(0, 32);
    const message = readField(payload, ["message", "text", "body"]).slice(0, 1_000);
    const providerId = readField(payload, ["id", "sms_id"]).slice(0, 80);
    const reference = message.match(PUBLIC_REFERENCE)?.[0]?.toUpperCase() || "";

    let ticketId: string | null = null;
    let companyId: string | null = null;
    let matchMethod: "reference" | "phone" | null = null;

    if (reference) {
      const ticket = await db.ticket.findFirst({
        where: { public_reference: reference, deleted_at: null },
        select: { id: true, company_id: true, user_id: true },
      });
      if (ticket) {
        ticketId = ticket.id;
        companyId = ticket.company_id;
        matchMethod = "reference";
        await attachResidentComment(ticket, from, message);
      }
    }

    if (!ticketId && from) {
      const tickets = await db.ticket.findMany({
        where: { deleted_at: null, reporter_phone: { in: swedishPhoneVariants(from) } },
        select: { id: true, company_id: true, user_id: true, status: true },
        orderBy: { created_at: "desc" },
        take: 40,
      });
      const ticket = pickTenantSafeTicket(tickets);
      if (ticket) {
        ticketId = ticket.id;
        companyId = ticket.company_id;
        matchMethod = "phone";
        await attachResidentComment(ticket, from, message);
      }
    }

    await db.integrationEvent.create({
      data: {
        company_id: companyId,
        type: "sms",
        recipient: from || null,
        status: ticketId ? "received" : "unmatched",
        payload: {
          direction: "inbound",
          providerId: providerId || null,
          ticketId,
          reference: reference || null,
          matchMethod,
          messagePreview: message.slice(0, 140),
        },
      },
    });

    return NextResponse.json({ success: true, matched: Boolean(ticketId) });
  } catch (error) {
    logger.error("Inbound SMS failed", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
