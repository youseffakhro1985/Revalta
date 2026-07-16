import { NextResponse } from "next/server";
import { runServiceEscalations } from "@/lib/service-escalation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const result = await runServiceEscalations();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
