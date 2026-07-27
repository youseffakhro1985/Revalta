import db from "@/lib/db";
import { auditScopedWhere, canManageWorkOrderFinance, canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, loadLegacyRows } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "budget.entry.created";
const allowedCategories = new Set(["income", "operations", "maintenance", "energy", "administration", "finance", "investment", "other"]);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewFinanceData(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa budgetdata" }, { status: 403 });
    }

    const [rows, logs, properties] = await Promise.all([
      user.company_id
        ? db.budgetEntry.findMany({
            where: { company_id: user.company_id, property: { deleted_at: null } },
            orderBy: { created_at: "desc" },
            take: 600,
            include: { property: { select: { name: true } } },
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 600,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      db.property.findMany({ where: { deleted_at: null, ...tenantWhere(user) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      year: row.year,
      category: row.category,
      account: row.account,
      budget: asNumber(row.budget),
      forecast: asNumber(row.forecast),
      actual: asNumber(row.actual),
      variance_budget: asNumber(row.actual) - asNumber(row.budget),
      variance_forecast: asNumber(row.actual) - asNumber(row.forecast),
      note: row.note || "",
      created_at: row.created_at,
      source: "table" as const,
    }));
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = logs
      .filter((log) => !isModernStorageMirror(log.metadata, "BudgetEntry", modernIds, log.entity_id) && !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({ entries: mergeByCreatedAt(modern, legacy, 600), properties });
  } catch (error) {
    console.error("Get budget error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const year = Number(body.year || new Date().getFullYear());
    const category = String(body.category || "other").trim();
    const account = String(body.account || "").trim();
    const budget = Number(body.budget || 0);
    const forecast = Number(body.forecast || 0);
    const actual = Number(body.actual || 0);
    const note = String(body.note || "").trim();
    if (!propertyId || !account || !Number.isInteger(year) || year < 2000 || year > 2100 || !allowedCategories.has(category)) {
      return NextResponse.json({ error: "Fastighet, år, kostnadsslag och konto krävs" }, { status: 400 });
    }
    if ([budget, forecast, actual].some((value) => !Number.isFinite(value))) {
      return NextResponse.json({ error: "Kontrollera beloppen" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const entry = await db.budgetEntry.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        year,
        category,
        account,
        budget,
        forecast,
        actual,
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "budget_entry",
      entityId: entry.id,
      action,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        year,
        category,
        account,
        budget,
        forecast,
        actual,
        variance_budget: actual - budget,
        variance_forecast: actual - forecast,
        note,
        storage: "BudgetEntry",
      },
    });
    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    console.error("Create budget error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const entryId = String(body.entryId || body.id || "").trim();
    if (!entryId) return NextResponse.json({ error: "Budgetrad-id krävs" }, { status: 400 });

    const fieldKeys = ["year", "category", "account", "budget", "forecast", "actual", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasFieldUpdate) {
      return NextResponse.json({ error: "Fält att uppdatera krävs" }, { status: 400 });
    }

    const existing = await db.budgetEntry.findFirst({
      where: { id: entryId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        property_id: true,
        year: true,
        category: true,
        account: true,
        budget: true,
        forecast: true,
        actual: true,
        note: true,
      },
    });
    if (!existing) {
      const orphaned = await db.budgetEntry.findFirst({
        where: { id: entryId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: entryId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Budgetraden finns kvar i äldre lagring. Kör backfill till BudgetEntry innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
    }

    let year = existing.year;
    let category = existing.category;
    let account = existing.account;
    let budget = asNumber(existing.budget);
    let forecast = asNumber(existing.forecast);
    let actual = asNumber(existing.actual);
    let note = existing.note || "";

    if (body.year !== undefined) year = Number(body.year);
    if (body.category !== undefined) category = String(body.category || "").trim();
    if (body.account !== undefined) account = String(body.account || "").trim();
    if (body.budget !== undefined) budget = Number(body.budget);
    if (body.forecast !== undefined) forecast = Number(body.forecast);
    if (body.actual !== undefined) actual = Number(body.actual);
    if (body.note !== undefined) note = String(body.note || "").trim();

    if (!account || !Number.isInteger(year) || year < 2000 || year > 2100 || !allowedCategories.has(category)) {
      return NextResponse.json({ error: "År, kostnadsslag och konto krävs" }, { status: 400 });
    }
    if ([budget, forecast, actual].some((value) => !Number.isFinite(value))) {
      return NextResponse.json({ error: "Kontrollera beloppen" }, { status: 400 });
    }

    const updateResult = await db.budgetEntry.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data: {
        year,
        category,
        account,
        budget,
        forecast,
        actual,
        note: note || null,
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "budget_entry",
      entityId: existing.id,
      action: "budget.entry.updated",
      metadata: {
        property_id: existing.property_id,
        year,
        category,
        account,
        budget,
        forecast,
        actual,
        variance_budget: actual - budget,
        variance_forecast: actual - forecast,
        note,
        storage: "BudgetEntry",
      },
    });

    return NextResponse.json({
      success: true,
      id: existing.id,
      year,
      category,
      account,
      budget,
      forecast,
      actual,
    });
  } catch (error) {
    console.error("Update budget entry error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const entryId = String(body.entryId || body.id || "").trim();
    if (!entryId) return NextResponse.json({ error: "Budgetrad-id krävs" }, { status: 400 });

    const existing = await db.budgetEntry.findFirst({
      where: { id: entryId, company_id: user.company_id, property: { deleted_at: null } },
      select: { id: true, account: true, year: true, category: true, property_id: true },
    });
    if (!existing) {
      const orphaned = await db.budgetEntry.findFirst({
        where: { id: entryId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: entryId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Budgetraden finns kvar i äldre lagring. Kör backfill till BudgetEntry innan den kan tas bort.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
    }

    const deleteResult = await db.budgetEntry.deleteMany({
      where: { id: existing.id, company_id: user.company_id },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Budgetraden hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "budget_entry",
      entityId: existing.id,
      action: "budget.entry.deleted",
      metadata: {
        property_id: existing.property_id,
        year: existing.year,
        category: existing.category,
        account: existing.account,
        storage: "BudgetEntry",
      },
    });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Delete budget entry error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
