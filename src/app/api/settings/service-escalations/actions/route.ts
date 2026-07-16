import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canManage(role: string) {
  return role === "owner" || role === "admin";
}

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://www.revalta.se";
}

async function sendTestEmail(to: string) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("E-postleverantören är inte konfigurerad");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Revalta: test av serviceeskalering",
      html: `<!doctype html><html lang="sv"><body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#22201d"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid #e7e1d7;border-radius:18px;background:#fff"><div style="padding:26px 30px;background:#174d45;color:#fff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Revalta</div><h1 style="margin:8px 0 0;font-size:25px">Test av serviceeskalering</h1></div><div style="padding:28px 30px"><p style="margin:0;line-height:1.65;color:#514e48">Detta är ett säkert testutskick från Revaltas administrativa eskaleringspanel. Den automatiska e-postleveransen fungerar.</p><p style="margin:26px 0 0"><a href="${appBaseUrl()}/dashboard/installningar/eskaleringar" style="display:inline-block;border-radius:10px;background:#174d45;padding:12px 18px;color:#fff;font-weight:700;text-decoration:none">Öppna eskaleringspanelen</a></p></div></div></div></body></html>`,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`E-postleverantören svarade ${response.status}: ${body.slice(0, 300)}`);
  return body;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Endast ägare och administratörer får utföra åtgärden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { action?: unknown };
  const action = body.action === "test" || body.action === "retry" ? body.action : null;
  if (!action) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const event = await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: "service_escalation_admin_action",
      status: "processing",
      recipient: user.email,
      payload: { action, requestedBy: user.id },
    },
  });

  try {
    let result: unknown;
    if (action === "test") {
      result = await sendTestEmail(user.email);
    } else {
      const secret = process.env.CRON_SECRET;
      if (!secret) throw new Error("CRON_SECRET är inte konfigurerad");
      const response = await fetch(`${appBaseUrl()}/api/cron/service-assignment-escalations`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Eskaleringsmotorn svarade ${response.status}: ${text.slice(0, 300)}`);
      result = JSON.parse(text) as unknown;
    }

    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "sent", payload: { action, requestedBy: user.id, result } },
    });
    return NextResponse.json({ success: true, action, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: "failed", payload: { action, requestedBy: user.id, error: message } },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
