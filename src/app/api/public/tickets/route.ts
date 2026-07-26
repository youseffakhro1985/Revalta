import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification, queueSmsNotification } from "@/lib/integrations";
import { analyzeTicket } from "@/lib/ai";
import { createPortalTrackingToken } from "@/lib/portal-tracking";
import { extractPortalCompanySlug, generatePublicReference, resolvePublicPortalCompany } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { calculateDueDate } from "@/lib/sla";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-ticket:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const body = await request.json();
    const { reporterName, reporterEmail, reporterPhone, reporterUnit, propertyId, title, description } = body;
    const normalizedReporterName = typeof reporterName === "string" ? reporterName.trim() : "";
    const normalizedReporterEmail = typeof reporterEmail === "string" ? reporterEmail.trim().toLowerCase() : "";
    const normalizedReporterPhone = typeof reporterPhone === "string" ? reporterPhone.trim() : "";
    const normalizedReporterUnit = typeof reporterUnit === "string" ? reporterUnit.trim() : "";
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const normalizedPropertyId = typeof propertyId === "string" && propertyId.trim() ? propertyId.trim() : null;
    const companySlug = extractPortalCompanySlug(request, body?.companySlug);

    const portal = await resolvePublicPortalCompany({
      propertyId: normalizedPropertyId,
      companySlug,
    });
    if (!portal) {
      return NextResponse.json({ error: "Boendeportalen är inte konfigurerad ännu" }, { status: 503 });
    }

    if (!normalizedReporterName || !normalizedReporterEmail.includes("@") || !normalizedTitle || normalizedDescription.length < 10) {
      return NextResponse.json({ error: "Namn, e-post, titel och tydlig beskrivning krävs" }, { status: 400 });
    }
    if (
      normalizedReporterName.length > 120 ||
      normalizedReporterEmail.length > 254 ||
      normalizedReporterPhone.length > 50 ||
      normalizedReporterUnit.length > 80 ||
      normalizedTitle.length > 200 ||
      normalizedDescription.length > 5_000
    ) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }

    let property = null;
    if (normalizedPropertyId) {
      property = await db.property.findFirst({
        where: { id: normalizedPropertyId, company_id: portal.company.id, status: "active", deleted_at: null },
        select: { id: true, name: true, address: true, city: true },
      });
      if (!property) {
        return NextResponse.json({ error: "Vald fastighet hittades inte" }, { status: 400 });
      }
    }

    const analysis = await analyzeTicket(normalizedDescription);
    let publicReference = generatePublicReference();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await db.ticket.findUnique({ where: { public_reference: publicReference }, select: { id: true } });
      if (!existing) break;
      publicReference = generatePublicReference();
    }

    const ticket = await db.ticket.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        status: "new",
        category: analysis.category,
        priority: analysis.priority,
        due_date: calculateDueDate(analysis.priority),
        company_id: portal.company.id,
        user_id: portal.owner.id,
        property_id: property?.id ?? null,
        public_reference: publicReference,
        source: "public_portal",
        reporter_name: normalizedReporterName,
        reporter_email: normalizedReporterEmail,
        reporter_phone: normalizedReporterPhone || null,
        reporter_unit: normalizedReporterUnit || null,
        ai_summary: analysis.summary,
        ai_recommended_action: analysis.recommendedAction,
        ai_confidence: analysis.confidence,
        ai_processed_at: new Date(),
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        public_reference: true,
        reporter_email: true,
        created_at: true,
        property: { select: { name: true, address: true, city: true } },
      },
    });

    await writeAuditLog({ id: portal.owner.id, company_id: portal.company.id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "public.ticket_created",
      metadata: {
        publicReference,
        reporterEmail: normalizedReporterEmail,
        property: property?.name ?? null,
      },
    });
    await queueTicketNotification({ company_id: portal.company.id }, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: normalizedReporterEmail,
      event: "created",
    });
    if (normalizedReporterPhone) {
      await queueSmsNotification({ company_id: portal.company.id }, {
        ticketId: ticket.id,
        recipient: normalizedReporterPhone,
        message: `Tack! Ärende ${publicReference} är mottaget.`,
      });
    }

    const trackingToken = createPortalTrackingToken({
      reference: publicReference,
      email: normalizedReporterEmail,
      companyId: portal.company.id,
    });

    return NextResponse.json({ success: true, ticket, trackingToken }, { status: 201 });
  } catch (error) {
    console.error("Create public ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
