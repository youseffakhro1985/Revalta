import db from "@/lib/db";
import {
  createPortalTrackingToken,
  extractPortalTrackingToken,
  verifyPortalTrackingToken,
} from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

type PublicCommentAuditMetadata = {
  commentId?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-track:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { reference } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();
    const tracking = verifyPortalTrackingToken(extractPortalTrackingToken(request));
    const authorizedEmail = tracking?.email || email;

    if (!reference || !authorizedEmail?.includes("@")) {
      return NextResponse.json({ error: "Referensnummer och e-post eller spårningstoken krävs" }, { status: 400 });
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return NextResponse.json({ error: "Ogiltig spårningstoken" }, { status: 403 });
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: authorizedEmail,
        ...(tracking ? { company_id: tracking.companyId } : {}),
      },
      select: {
        id: true,
        company_id: true,
        reporter_name: true,
        reporter_email: true,
        public_reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        created_at: true,
        updated_at: true,
        ai_summary: true,
        property: { select: { name: true, address: true, city: true } },
        comments: {
          where: { is_internal: false },
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            body: true,
            created_at: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!ticket?.company_id) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    const externalAuthorLogs = await db.auditLog.findMany({
      where: {
        company_id: ticket.company_id,
        entity_type: "ticket",
        entity_id: ticket.id,
        action: "public.comment_created",
      },
      orderBy: { created_at: "asc" },
      select: { metadata: true },
    });

    const externalAuthors = new Map<string, { type: "resident"; name: string }>();
    for (const log of externalAuthorLogs) {
      const metadata = (log.metadata || {}) as PublicCommentAuditMetadata;
      if (typeof metadata.commentId !== "string") continue;
      const name = typeof metadata.reporterName === "string" && metadata.reporterName.trim()
        ? metadata.reporterName.trim()
        : ticket.reporter_name || "Boende";
      externalAuthors.set(metadata.commentId, { type: "resident", name });
    }

    const trackingToken = createPortalTrackingToken({
      reference: ticket.public_reference || reference.toUpperCase(),
      email: authorizedEmail,
      companyId: ticket.company_id,
    });

    return NextResponse.json({
      trackingToken,
      ticket: {
        public_reference: ticket.public_reference,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        ai_summary: ticket.ai_summary,
        property: ticket.property,
        comments: ticket.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          created_at: comment.created_at,
          author: externalAuthors.get(comment.id) || {
            type: "management" as const,
            name: comment.user.name || "Förvaltningen",
          },
        })),
      },
    });
  } catch (error) {
    console.error("Get public ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
