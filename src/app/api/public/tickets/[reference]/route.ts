import { NextResponse } from "next/server";
import { loadPublicTrackedTicket } from "@/lib/public-ticket-track";
import { extractPortalTrackingToken } from "@/lib/portal-tracking";
import { getClientIp } from "@/lib/rate-limit";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]" });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await params;
    const { searchParams } = new URL(request.url);
    const result = await loadPublicTrackedTicket({
      reference,
      email: searchParams.get("email"),
      token: extractPortalTrackingToken(request),
      ip: getClientIp(request),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      trackingToken: result.trackingToken,
      ticket: result.ticket,
    });
  } catch (error) {
    logger.error("Get public ticket error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
