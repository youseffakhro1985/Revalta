import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "quote.created";
const decisionAction = "quote.status_changed";
const updateAction = "quote.updated";
const allowedStatuses = new Set(["draft", "sent", "approved", "rejected", "invoiced", "cancelled"]);
const fieldEditableStatuses = new Set(["draft", "sent"]);

function money(value: { toString(): string } | number) {
  return Number(value);
}

function parseOptionalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [rows, decisions, legacyLogs, legacyDecisions, properties] = await Promise.all([
      db.quote.findMany({
        where: { company_id: user.company_id, property: { deleted_at: null } },
        orderBy: { created_at: "desc" },
        take: 300,
        include: {
          property: { select: { name: true } },
          decisions: {
            orderBy: { created_at: "desc" },
            take: 20,
            include: { actor: { select: { name: true, email: true } } },
          },
        },
      }),
      db.quoteDecision.findMany({
        where: { company_id: user.company_id },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { quote_id: true },
      }),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 300,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action: decisionAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
      }),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);
    void decisions;

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      title: row.title,
      supplier: row.supplier || "",
      status: row.status,
      valid_until: row.valid_until?.toISOString().slice(0, 10) || null,
      labor: money(row.labor),
      material: money(row.material),
      supplier_cost: money(row.supplier_cost),
      other: money(row.other),
      subtotal: money(row.subtotal),
      vat_rate: money(row.vat_rate),
      vat: money(row.vat),
      total: money(row.total),
      note: row.note || "",
      decision_comment: row.decision_comment || null,
      decision_at: row.decision_at?.toISOString() || null,
      decision_by: row.decision_by || null,
      history: row.decisions.map((decision) => ({
        id: decision.id,
        quote_id: row.id,
        previous_status: decision.previous_status,
        status: decision.status,
        comment: decision.comment,
        actor_name: decision.actor.name || decision.actor.email || "Användare",
        created_at: decision.created_at,
      })),
      created_at: row.created_at,
      source: "table" as const,
    }));

    const modernIds = new Set(modern.map((row) => row.id));
    const legacyDecisionMap = new Map<string, Array<Record<string, unknown>>>();
    for (const decision of legacyDecisions) {
      const metadata = (decision.metadata || {}) as Record<string, unknown>;
      const quoteId = String(metadata.quote_id || "");
      if (!quoteId || modernIds.has(quoteId) || metadata.storage === "Quote") continue;
      const items = legacyDecisionMap.get(quoteId) || [];
      items.push({
        id: decision.id,
        ...metadata,
        actor_name: decision.actor?.name || decision.actor?.email || "Användare",
        created_at: decision.created_at,
      });
      legacyDecisionMap.set(quoteId, items);
    }

    const legacy = legacyLogs
      .filter((log) => !isModernStorageMirror(log.metadata, "Quote", modernIds, log.entity_id) && !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        history: legacyDecisionMap.get(log.id) || [],
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      quotes: mergeByCreatedAt(modern, legacy, 300),
      properties,
    });
  } catch (error) {
    console.error("Get quotes error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const title = String(body.title || "").trim();
    const supplier = String(body.supplier || "").trim();
    const status = String(body.status || "draft").trim();
    const validUntil = String(body.validUntil || "").trim();
    const note = String(body.note || "").trim();
    const labor = Number(body.labor || 0);
    const material = Number(body.material || 0);
    const supplierCost = Number(body.supplierCost || 0);
    const other = Number(body.other || 0);
    const vatRate = Number(body.vatRate ?? 25);

    if (!propertyId || !title || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, offertnamn och giltig status krävs" }, { status: 400 });
    }

    const amounts = [labor, material, supplierCost, other, vatRate];
    if (amounts.some((value) => !Number.isFinite(value) || value < 0) || vatRate > 100) {
      return NextResponse.json({ error: "Kontrollera belopp och momssats" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const subtotal = labor + material + supplierCost + other;
    const vat = subtotal * (vatRate / 100);
    const total = subtotal + vat;

    const quote = await db.quote.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        title,
        supplier: supplier || null,
        status,
        valid_until: parseOptionalDate(validUntil),
        labor,
        material,
        supplier_cost: supplierCost,
        other,
        subtotal,
        vat_rate: vatRate,
        vat,
        total,
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "quote",
      entityId: quote.id,
      action,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        title,
        supplier,
        status,
        valid_until: validUntil || null,
        labor,
        material,
        supplier_cost: supplierCost,
        other,
        subtotal,
        vat_rate: vatRate,
        vat,
        total,
        note,
        storage: "Quote",
      },
    });

    return NextResponse.json({ success: true, quote }, { status: 201 });
  } catch (error) {
    console.error("Create quote error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const quoteId = String(body.quoteId || body.id || "").trim();
    if (!quoteId) return NextResponse.json({ error: "Offert-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    const comment = String(body.comment || "").trim();
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const fieldKeys = ["title", "supplier", "validUntil", "labor", "material", "supplierCost", "other", "vatRate", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const quote = await db.quote.findFirst({
      where: { id: quoteId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        property_id: true,
        title: true,
        supplier: true,
        status: true,
        valid_until: true,
        labor: true,
        material: true,
        supplier_cost: true,
        other: true,
        vat_rate: true,
        note: true,
      },
    });

    if (!quote) {
      const orphaned = await db.quote.findFirst({
        where: { id: quoteId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Offerten hittades inte" }, { status: 404 });
      }

      const legacyQuote = await db.auditLog.findFirst({
        where: { id: quoteId, ...auditScopedWhere(user), action },
        select: { id: true },
      });
      if (legacyQuote) {
        return NextResponse.json({
          error: "Offerten finns kvar i äldre lagring. Kör backfill till Quote innan den kan uppdateras.",
        }, { status: 409 });
      }

      return NextResponse.json({ error: "Offerten hittades inte" }, { status: 404 });
    }

    if (hasFieldUpdate && !fieldEditableStatuses.has(quote.status)) {
      return NextResponse.json({
        error: "Belopp och uppgifter kan bara ändras när offerten är utkast eller skickad",
      }, { status: 400 });
    }

    let title = quote.title;
    let supplier = quote.supplier || "";
    let validUntil = quote.valid_until;
    let labor = money(quote.labor);
    let material = money(quote.material);
    let supplierCost = money(quote.supplier_cost);
    let other = money(quote.other);
    let vatRate = money(quote.vat_rate);
    let note = quote.note || "";

    if (hasFieldUpdate) {
      if (body.title !== undefined) title = String(body.title || "").trim();
      if (body.supplier !== undefined) supplier = String(body.supplier || "").trim();
      if (body.validUntil !== undefined) {
        const raw = String(body.validUntil || "").trim();
        validUntil = parseOptionalDate(raw);
        if (raw && !validUntil) {
          return NextResponse.json({ error: "Ogiltigt giltighetsdatum" }, { status: 400 });
        }
      }
      if (body.labor !== undefined) labor = Number(body.labor);
      if (body.material !== undefined) material = Number(body.material);
      if (body.supplierCost !== undefined) supplierCost = Number(body.supplierCost);
      if (body.other !== undefined) other = Number(body.other);
      if (body.vatRate !== undefined) vatRate = Number(body.vatRate);
      if (body.note !== undefined) note = String(body.note || "").trim();

      if (!title) {
        return NextResponse.json({ error: "Offertnamn krävs" }, { status: 400 });
      }
      const amounts = [labor, material, supplierCost, other, vatRate];
      if (amounts.some((value) => !Number.isFinite(value) || value < 0) || vatRate > 100) {
        return NextResponse.json({ error: "Kontrollera belopp och momssats" }, { status: 400 });
      }
    }

    const subtotal = labor + material + supplierCost + other;
    const vat = subtotal * (vatRate / 100);
    const total = subtotal + vat;
    const nextStatus = hasStatus ? status : quote.status;
    const statusChanged = hasStatus && nextStatus !== quote.status;
    const statusOnly = hasStatus && !hasFieldUpdate;

    if (statusOnly && !statusChanged) {
      return NextResponse.json({ success: true, id: quote.id, status: nextStatus });
    }

    const changedAt = new Date();
    const data = hasFieldUpdate
      ? {
          title,
          supplier: supplier || null,
          valid_until: validUntil,
          labor,
          material,
          supplier_cost: supplierCost,
          other,
          subtotal,
          vat_rate: vatRate,
          vat,
          total,
          note: note || null,
          ...(statusChanged
            ? {
                status: nextStatus,
                decision_comment: comment || null,
                decision_at: changedAt,
                decision_by: user.name || user.email,
              }
            : {}),
        }
      : {
          status: nextStatus,
          decision_comment: comment || null,
          decision_at: changedAt,
          decision_by: user.name || user.email,
        };

    const updateResult = await db.quote.updateMany({
      where: { id: quote.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) return NextResponse.json({ error: "Offerten hittades inte" }, { status: 404 });

    if (statusChanged) {
      await db.quoteDecision.create({
        data: {
          company_id: user.company_id,
          quote_id: quote.id,
          previous_status: quote.status,
          status: nextStatus,
          comment: comment || null,
          actor_user_id: user.id,
        },
      });

      await writeAuditLog(user, {
        entityType: "quote",
        entityId: quote.id,
        action: decisionAction,
        metadata: {
          quote_id: quote.id,
          title,
          previous_status: quote.status,
          status: nextStatus,
          comment: comment || null,
          storage: "Quote",
        },
      });
    }

    if (hasFieldUpdate) {
      await writeAuditLog(user, {
        entityType: "quote",
        entityId: quote.id,
        action: updateAction,
        metadata: {
          quote_id: quote.id,
          property_id: quote.property_id,
          title,
          supplier,
          status: nextStatus,
          valid_until: validUntil?.toISOString().slice(0, 10) || null,
          labor,
          material,
          supplier_cost: supplierCost,
          other,
          subtotal,
          vat_rate: vatRate,
          vat,
          total,
          note,
          storage: "Quote",
        },
      });
    }

    return NextResponse.json({
      success: true,
      id: quote.id,
      status: nextStatus,
      subtotal,
      vat,
      total,
    });
  } catch (error) {
    console.error("Update quote error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
