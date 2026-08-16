import { NextResponse } from "next/server";
import { deliverDemoRequest, type DemoRequest } from "@/lib/demo-request-email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isDeclaredRequestBodyTooLarge, isTrustedMutationRequest } from "@/lib/request-security";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/demo-request" });
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, maxLength);
}

function validateBody(value: unknown): DemoRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const name = text(body.name, 100);
  const email = text(body.email, 254)?.toLowerCase() ?? null;
  const company = text(body.company, 120);
  const phone = optionalText(body.phone, 40);
  const role = optionalText(body.role, 80);
  const portfolio = optionalText(body.portfolio, 80);
  const message = optionalText(body.message, 1500);

  if (!name || name.length < 2 || !email || email.length < 5 || !EMAIL_PATTERN.test(email) || !company || company.length < 2) {
    return null;
  }

  return { name, email, company, phone, role, portfolio, message };
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (!isTrustedMutationRequest(request)) {
    return response({ error: "Ogiltig förfrågan" }, 403);
  }
  if (isDeclaredRequestBodyTooLarge(request)) {
    return response({ error: "Förfrågan är för stor" }, 413);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return response({ error: "Ogiltig förfrågan" }, 400);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const honeypot = (raw as Record<string, unknown>).website;
    if (typeof honeypot === "string" && honeypot.trim()) {
      logger.info("Demo request honeypot triggered", { latencyMs: Date.now() - startedAt });
      return response({ ok: true }, 202);
    }
  }

  const input = validateBody(raw);
  if (!input) {
    return response({ error: "Kontrollera namn, e-post och företag och försök igen." }, 400);
  }

  const clientIp = getClientIp(request);
  const [ipLimit, identityLimit] = await Promise.all([
    checkRateLimit(`demo-request:ip:${clientIp}`, 10, 60 * 60 * 1000),
    checkRateLimit(`demo-request:identity:${clientIp}:${input.email}`, 3, 60 * 60 * 1000),
  ]);
  if (!ipLimit.allowed || !identityLimit.allowed) {
    logger.warn("Demo request rate limited", {
      source: !ipLimit.allowed ? ipLimit.source : identityLimit.source,
      latencyMs: Date.now() - startedAt,
    });
    return response({ error: "För många förfrågningar. Försök igen senare." }, 429);
  }

  const delivery = await deliverDemoRequest(input);
  if (!delivery.ok) {
    logger.warn("Demo request could not be delivered", {
      reason: delivery.reason,
      latencyMs: Date.now() - startedAt,
    });
    return response({ error: "Demoformuläret är tillfälligt inte tillgängligt. Försök igen senare." }, 503);
  }

  logger.info("Demo request delivered", { latencyMs: Date.now() - startedAt });
  return response({ ok: true, message: "Tack. Vi återkommer om en demo." }, 202);
}
