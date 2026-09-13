import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/integrations/sms/inbound" });
const PUBLIC_REFERENCE = /\bRV-\d{4}-[A-Z0-9]+\b/i;

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
    if (reference) {
      const ticket = await db.ticket.findFirst({
        where: { public_reference: reference, deleted_at: null },
        select: { id: true, company_id: true, user_id: true },
      });
      if (ticket) {
        ticketId = ticket.id;
        companyId = ticket.company_id;
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
