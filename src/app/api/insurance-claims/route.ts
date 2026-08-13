import db from "@/lib/db";
import { auditScopedWhere, canManageWorkOrderFinance, canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, parseOptionalDate, loadLegacyRows } from "@/lib/dual-list";
import {
  activePropertyRelationFilter,
  isMissingSchemaColumnError,
  isMissingTableError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/insurance-claims" });

const action = "insurance_claim.created";

async function listInsuranceClaimRows(companyId: string, propertyRelation: Record<string, unknown>) {
  try {
    return await db.insuranceClaim.findMany({
      where: { company_id: companyId, ...propertyRelation },
      orderBy: { created_at: "desc" },
      take: 400,
      include: { property: { select: { name: true } } },
    });
  } catch (error) {
    if (isMissingTableError(error, "InsuranceClaim")) {
      return [];
    }
    throw error;
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewFinanceData(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa skadeärenden" }, { status: 403 });
    }

    const [propertyActive, propertyRelation] = await Promise.all([
      notDeletedFilter("Property"),
      activePropertyRelationFilter(),
    ]);
    const [rows, logs, properties] = await Promise.all([
      user.company_id ? listInsuranceClaimRows(user.company_id, propertyRelation) : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 400,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      db.property.findMany({
        where: { ...propertyActive, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modern = rows.map((row) => {
      const estimated = asNumber(row.estimated_cost);
      const compensation = asNumber(row.compensation);
      return {
        id: row.id,
        property_id: row.property_id,
        property_name: row.property.name,
        title: row.title,
        damage_type: row.damage_type,
        incident_date: row.incident_date?.toISOString().slice(0, 10) || null,
        location: row.location || "",
        insurer: row.insurer || "",
        claim_number: row.claim_number || "",
        responsible: row.responsible || "",
        status: row.status,
        estimated_cost: estimated,
        deductible: asNumber(row.deductible),
        compensation,
        net_cost: Math.max(0, estimated - compensation),
        note: row.note || "",
        created_at: row.created_at,
        source: "table" as const,
      };
    });
    const modernIds = new Set(modern.map((row) => row.id));
    const legacy = logs
      .filter((log) => !isModernStorageMirror(log.metadata, "InsuranceClaim", modernIds, log.entity_id) && !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      claims: mergeByCreatedAt(modern, legacy, 400),
      properties,
      permissions: { canManage: canManageWorkOrderFinance(user.role) },
    });
  } catch (error) {
    logger.error("Get insurance claims error", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
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
    const title = String(body.title || "").trim();
    const damageType = String(body.damageType || "other").trim();
    const incidentDate = String(body.incidentDate || "").trim();
    const location = String(body.location || "").trim();
    const insurer = String(body.insurer || "").trim();
    const claimNumber = String(body.claimNumber || "").trim();
    const responsible = String(body.responsible || "").trim();
    const status = String(body.status || "reported").trim();
    const estimatedCost = Number(body.estimatedCost || 0);
    const deductible = Number(body.deductible || 0);
    const compensation = Number(body.compensation || 0);
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["water", "fire", "theft", "storm", "liability", "machine", "glass", "other"]);
    const allowedStatuses = new Set(["reported", "investigating", "awaiting_insurer", "repairing", "settled", "closed"]);
    if (!propertyId || !title || !allowedTypes.has(damageType) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, rubrik och giltig status krävs" }, { status: 400 });
    }
    if (![estimatedCost, deductible, compensation].every((value) => Number.isFinite(value) && value >= 0)) {
      return NextResponse.json({ error: "Kontrollera ekonomiska belopp" }, { status: 400 });
    }

    const propertyActive = await notDeletedFilter("Property");
    const property = await db.property.findFirst({
      where: { id: propertyId, ...propertyActive, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const parsedIncident = incidentDate ? parseOptionalDate(incidentDate) : null;
    if (incidentDate && !parsedIncident) return NextResponse.json({ error: "Ogiltigt skadedatum" }, { status: 400 });

    let claim: { id: string };
    try {
      claim = await db.insuranceClaim.create({
        data: {
          company_id: user.company_id,
          property_id: property.id,
          title,
          damage_type: damageType,
          incident_date: parsedIncident,
          location: location || null,
          insurer: insurer || null,
          claim_number: claimNumber || null,
          responsible: responsible || null,
          status,
          estimated_cost: estimatedCost,
          deductible,
          compensation,
          note: note || null,
          created_by_id: user.id,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isMissingTableError(error, "InsuranceClaim")) {
        return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
      }
      throw error;
    }

    await writeAuditLog(user, {
      entityType: "insurance_claim",
      entityId: claim.id,
      action,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        title,
        damage_type: damageType,
        incident_date: incidentDate || null,
        location,
        insurer,
        claim_number: claimNumber,
        responsible,
        status,
        estimated_cost: estimatedCost,
        deductible,
        compensation,
        net_cost: Math.max(0, estimatedCost - compensation),
        note,
        storage: "InsuranceClaim",
      },
    });

    return NextResponse.json({ success: true, claim }, { status: 201 });
  } catch (error) {
    logger.error("Create insurance claim error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

const allowedStatuses = new Set(["reported", "investigating", "awaiting_insurer", "repairing", "settled", "closed"]);
const closedStatuses = new Set(["settled", "closed"]);

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const claimId = String(body.claimId || body.id || "").trim();
    if (!claimId) return NextResponse.json({ error: "Ärende-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const fieldKeys = ["title", "estimatedCost", "deductible", "compensation", "claimNumber", "insurer", "location", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const existing = await db.insuranceClaim.findFirst({
      where: { id: claimId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        title: true,
        status: true,
        estimated_cost: true,
        deductible: true,
        compensation: true,
        claim_number: true,
        insurer: true,
        location: true,
        note: true,
      },
    });
    if (!existing) {
      const orphaned = await db.insuranceClaim.findFirst({
        where: { id: claimId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Skadeärendet hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: claimId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Skadeärendet finns kvar i äldre lagring. Kör backfill till InsuranceClaim innan det kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Skadeärendet hittades inte" }, { status: 404 });
    }

    if (hasFieldUpdate && closedStatuses.has(existing.status)) {
      return NextResponse.json({ error: "Avslutade eller reglerade ärenden kan bara få ny status" }, { status: 400 });
    }

    const nextStatus = hasStatus ? status : existing.status;
    let title = existing.title;
    let estimatedCost = asNumber(existing.estimated_cost);
    let deductible = asNumber(existing.deductible);
    let compensation = asNumber(existing.compensation);
    let claimNumber = existing.claim_number || "";
    let insurer = existing.insurer || "";
    let location = existing.location || "";
    let note = existing.note || "";

    if (hasFieldUpdate) {
      if (body.title !== undefined) title = String(body.title || "").trim();
      if (body.estimatedCost !== undefined) estimatedCost = Number(body.estimatedCost);
      if (body.deductible !== undefined) deductible = Number(body.deductible);
      if (body.compensation !== undefined) compensation = Number(body.compensation);
      if (body.claimNumber !== undefined) claimNumber = String(body.claimNumber || "").trim();
      if (body.insurer !== undefined) insurer = String(body.insurer || "").trim();
      if (body.location !== undefined) location = String(body.location || "").trim();
      if (body.note !== undefined) note = String(body.note || "").trim();
      if (!title) return NextResponse.json({ error: "Rubrik krävs" }, { status: 400 });
      if (![estimatedCost, deductible, compensation].every((value) => Number.isFinite(value) && value >= 0)) {
        return NextResponse.json({ error: "Kontrollera ekonomiska belopp" }, { status: 400 });
      }
    }

    const statusOnly = hasStatus && !hasFieldUpdate;
    if (statusOnly && existing.status === nextStatus) {
      return NextResponse.json({ success: true, id: existing.id, status: nextStatus });
    }

    const data = hasFieldUpdate
      ? {
          status: nextStatus,
          title,
          estimated_cost: estimatedCost,
          deductible,
          compensation,
          claim_number: claimNumber || null,
          insurer: insurer || null,
          location: location || null,
          note: note || null,
        }
      : { status: nextStatus };

    const updateResult = await db.insuranceClaim.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Skadeärendet hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "insurance_claim",
      entityId: existing.id,
      action: statusOnly ? "insurance_claim.status_updated" : "insurance_claim.updated",
      metadata: {
        title,
        previousStatus: existing.status,
        status: nextStatus,
        estimated_cost: estimatedCost,
        deductible,
        compensation,
        claim_number: claimNumber,
        insurer,
        location,
        note,
        storage: "InsuranceClaim",
      },
    });

    return NextResponse.json({
      success: true,
      id: existing.id,
      status: nextStatus,
      net_cost: Math.max(0, estimatedCost - compensation),
    });
  } catch (error) {
    logger.error("Update insurance claim error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
