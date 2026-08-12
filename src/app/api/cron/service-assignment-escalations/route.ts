import { NextResponse } from "next/server";
import { runServiceEscalations } from "@/lib/service-escalation-engine";
import { isCronRequestAuthorized } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const result = await runServiceEscalations();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
