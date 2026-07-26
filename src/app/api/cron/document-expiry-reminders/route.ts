import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  try {
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + 30);

    const documents = await db.managedDocument.findMany({
      where: {
        lifecycle_state: "active",
        valid_until: { not: null, lte: horizon, gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { valid_until: "asc" },
      take: 500,
      select: {
        id: true,
        company_id: true,
        name: true,
        category: true,
        valid_until: true,
        created_by_id: true,
      },
    });

    let created = 0;
    let skipped = 0;

    for (const document of documents) {
      const validUntil = document.valid_until;
      if (!validUntil) { skipped += 1; continue; }
      const days = daysUntil(validUntil);
      const dedupeKey = `document-expiry:${document.id}:${validUntil.toISOString().slice(0, 10)}`;
      const existing = await db.appNotification.findFirst({
        where: {
          company_id: document.company_id,
          deleted_at: null,
          title: { startsWith: "Dokument går ut" },
          message: { contains: document.id },
          created_at: { gte: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (existing) { skipped += 1; continue; }

      const urgency = days <= 0 ? "hög" : days <= 7 ? "hög" : "normal";
      const title = days <= 0
        ? `Dokument har gått ut: ${document.name}`
        : `Dokument går ut om ${days} dagar: ${document.name}`;
      const message = [
        `Dokumentet ”${document.name}” (${document.category})`,
        days <= 0 ? "har gått ut." : `går ut ${validUntil.toISOString().slice(0, 10)}.`,
        `Öppna dokumentarkivet och förnya eller arkivera. Ref: ${document.id}`,
      ].join(" ");

      await db.$transaction(async (tx) => {
        await tx.appNotification.create({
          data: {
            company_id: document.company_id,
            title,
            message,
            priority: urgency === "hög" ? "high" : "normal",
            audience: "Förvaltning",
            author_name: "Revalta",
            created_by_id: document.created_by_id,
          },
        });
        await tx.auditLog.create({
          data: {
            company_id: document.company_id,
            actor_user_id: document.created_by_id,
            entity_type: "document",
            entity_id: document.id,
            action: "document.expiry_reminder",
            metadata: {
              dedupeKey,
              validUntil: validUntil.toISOString(),
              daysRemaining: days,
            },
          },
        });
      });
      created += 1;
    }

    return NextResponse.json({
      ok: true,
      scanned: documents.length,
      created,
      skipped,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Document expiry reminders error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
