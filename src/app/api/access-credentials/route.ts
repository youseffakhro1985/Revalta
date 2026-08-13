import db from "@/lib/db";
import { auditScopedWhere, canManageAccessCredentials, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { loadLegacyRows } from "@/lib/dual-list";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

const legacyAction = "access.credential.created";
const logger = createLogger({ route: "/api/access-credentials" });

function parseOptionalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageAccessCredentials(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa nycklar och passage" }, { status: 403 });
    }
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [rows, legacyLogs, properties] = await Promise.all([
      db.accessCredential.findMany({
        where: { company_id: user.company_id, property: { deleted_at: null } },
        orderBy: { created_at: "desc" },
        take: 400,
        select: {
          id: true,
          property_id: true,
          identifier: true,
          credential_type: true,
          holder: true,
          unit: true,
          access_area: true,
          status: true,
          issued_at: true,
          return_due: true,
          note: true,
          created_at: true,
          property: { select: { name: true } },
          created_by: { select: { name: true, email: true } },
        },
      }),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action: legacyAction },
        orderBy: { created_at: "desc" },
        take: 400,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      identifier: row.identifier,
      credential_type: row.credential_type,
      holder: row.holder || "",
      unit: row.unit || "",
      access_area: row.access_area || "",
      status: row.status,
      issued_at: row.issued_at?.toISOString().slice(0, 10) || null,
      return_due: row.return_due?.toISOString().slice(0, 10) || null,
      note: row.note || "",
      registered_by: row.created_by.name || row.created_by.email,
      created_at: row.created_at,
      source: "table" as const,
    }));

    const modernKeys = new Set(
      modern.map((row) => `${row.property_id}|${row.identifier}|${row.credential_type}|${row.created_at.toISOString()}`),
    );

    const legacy = legacyLogs
      .map((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        const identifier = typeof metadata.identifier === "string" ? metadata.identifier : "";
        const credentialType = typeof metadata.credential_type === "string" ? metadata.credential_type : "key";
        const key = `${log.entity_id || ""}|${identifier}|${credentialType}|${log.created_at.toISOString()}`;
        return {
          id: log.id,
          property_id: log.entity_id,
          property_name: typeof metadata.property_name === "string" ? metadata.property_name : "",
          identifier,
          credential_type: credentialType,
          holder: typeof metadata.holder === "string" ? metadata.holder : "",
          unit: typeof metadata.unit === "string" ? metadata.unit : "",
          access_area: typeof metadata.access_area === "string" ? metadata.access_area : "",
          status: typeof metadata.status === "string" ? metadata.status : "in_stock",
          issued_at: typeof metadata.issued_at === "string" ? metadata.issued_at : null,
          return_due: typeof metadata.return_due === "string" ? metadata.return_due : null,
          note: typeof metadata.note === "string" ? metadata.note : "",
          registered_by: typeof metadata.registered_by === "string" ? metadata.registered_by : "Okänd",
          created_at: log.created_at,
          source: "legacy" as const,
          _dedupeKey: key,
        };
      })
      .filter((row) => row.identifier && !modernKeys.has(row._dedupeKey))
      .map((row) => {
        const { _dedupeKey, ...rest } = row;
        void _dedupeKey;
        return rest;
      });

    const credentials = [...modern, ...legacy]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, 400);

    return NextResponse.json({ credentials, properties });
  } catch (error) {
    logger.error("Get access credentials error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageAccessCredentials(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const identifier = String(body.identifier || "").trim();
    const credentialType = String(body.credentialType || "key").trim();
    const holder = String(body.holder || "").trim();
    const unit = String(body.unit || "").trim();
    const accessArea = String(body.accessArea || "").trim();
    const status = String(body.status || "in_stock").trim();
    const issuedAt = String(body.issuedAt || "").trim();
    const returnDue = String(body.returnDue || "").trim();
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["key", "tag", "card", "code", "remote"]);
    const allowedStatuses = new Set(["in_stock", "issued", "returned", "blocked", "lost"]);
    if (!propertyId || !identifier || !allowedTypes.has(credentialType) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, identitet, typ och giltig status krävs" }, { status: 400 });
    }
    if (identifier.length > 120 || holder.length > 160 || unit.length > 80 || accessArea.length > 160 || note.length > 1000) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }
    if (status === "issued" && !holder) {
      return NextResponse.json({ error: "Mottagare krävs vid utlämning" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const credential = await db.accessCredential.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        identifier,
        credential_type: credentialType,
        holder: holder || null,
        unit: unit || null,
        access_area: accessArea || null,
        status,
        issued_at: parseOptionalDate(issuedAt),
        return_due: parseOptionalDate(returnDue),
        note: note || null,
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "access_credential",
      entityId: credential.id,
      action: legacyAction,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        identifier,
        credential_type: credentialType,
        holder,
        unit,
        access_area: accessArea,
        status,
        issued_at: issuedAt || null,
        return_due: returnDue || null,
        note,
        registered_by: user.name || user.email,
        storage: "AccessCredential",
      },
    });

    return NextResponse.json({ success: true, credential }, { status: 201 });
  } catch (error) {
    logger.error("Create access credential error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageAccessCredentials(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    }
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const credentialId = String(body.credentialId || body.id || "").trim();
    if (!credentialId) {
      return NextResponse.json({ error: "Behörighets-id krävs" }, { status: 400 });
    }

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    const fieldKeys = [
      "identifier",
      "credentialType",
      "holder",
      "unit",
      "accessArea",
      "issuedAt",
      "returnDue",
      "note",
    ] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const allowedTypes = new Set(["key", "tag", "card", "code", "remote"]);
    const allowedStatuses = new Set(["in_stock", "issued", "returned", "blocked", "lost"]);
    if (hasStatus && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const holder = body.holder !== undefined ? String(body.holder || "").trim() : undefined;
    const identifier = body.identifier !== undefined ? String(body.identifier || "").trim() : undefined;
    const credentialType =
      body.credentialType !== undefined ? String(body.credentialType || "").trim() : undefined;
    const unit = body.unit !== undefined ? String(body.unit || "").trim() : undefined;
    const accessArea = body.accessArea !== undefined ? String(body.accessArea || "").trim() : undefined;
    const note = body.note !== undefined ? String(body.note || "").trim() : undefined;
    const issuedAtRaw = body.issuedAt !== undefined ? String(body.issuedAt || "").trim() : undefined;
    const returnDueRaw = body.returnDue !== undefined ? String(body.returnDue || "").trim() : undefined;

    if (identifier !== undefined && (!identifier || identifier.length > 120)) {
      return NextResponse.json({ error: "Identitet krävs och får vara max 120 tecken" }, { status: 400 });
    }
    if (credentialType !== undefined && !allowedTypes.has(credentialType)) {
      return NextResponse.json({ error: "Ogiltig behörighetstyp" }, { status: 400 });
    }
    if (holder !== undefined && holder.length > 160) {
      return NextResponse.json({ error: "Mottagaren är för lång" }, { status: 400 });
    }
    if (unit !== undefined && unit.length > 80) {
      return NextResponse.json({ error: "Lägenhet/lokal är för lång" }, { status: 400 });
    }
    if (accessArea !== undefined && accessArea.length > 160) {
      return NextResponse.json({ error: "Behörighetsområdet är för långt" }, { status: 400 });
    }
    if (note !== undefined && note.length > 1000) {
      return NextResponse.json({ error: "Anteckningen är för lång" }, { status: 400 });
    }
    if (issuedAtRaw !== undefined && issuedAtRaw && !parseOptionalDate(issuedAtRaw)) {
      return NextResponse.json({ error: "Ogiltigt utlämningsdatum" }, { status: 400 });
    }
    if (returnDueRaw !== undefined && returnDueRaw && !parseOptionalDate(returnDueRaw)) {
      return NextResponse.json({ error: "Ogiltigt återlämningsdatum" }, { status: 400 });
    }

    const existing = await db.accessCredential.findFirst({
      where: { id: credentialId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        status: true,
        holder: true,
        identifier: true,
        credential_type: true,
        unit: true,
        access_area: true,
        issued_at: true,
        return_due: true,
        note: true,
      },
    });
    if (!existing) {
      const orphaned = await db.accessCredential.findFirst({
        where: { id: credentialId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Behörigheten hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action: legacyAction, id: credentialId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Behörigheten finns kvar i äldre lagring. Kör backfill till AccessCredential innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Behörigheten hittades inte" }, { status: 404 });
    }

    const nextStatus = hasStatus ? status : existing.status;
    const nextHolder = holder !== undefined ? holder : existing.holder || "";
    if (nextStatus === "issued" && !nextHolder) {
      return NextResponse.json({ error: "Mottagare krävs vid utlämning" }, { status: 400 });
    }

    const data: {
      status?: string;
      holder?: string | null;
      identifier?: string;
      credential_type?: string;
      unit?: string | null;
      access_area?: string | null;
      issued_at?: Date | null;
      return_due?: Date | null;
      note?: string | null;
    } = {};

    if (hasStatus) {
      data.status = status;
      if (status === "issued" && existing.status !== "issued" && issuedAtRaw === undefined) {
        data.issued_at = new Date();
      }
      if (status === "returned" || status === "in_stock") {
        data.return_due = null;
      }
    }
    if (holder !== undefined) data.holder = holder || null;
    if (identifier !== undefined) data.identifier = identifier;
    if (credentialType !== undefined) data.credential_type = credentialType;
    if (unit !== undefined) data.unit = unit || null;
    if (accessArea !== undefined) data.access_area = accessArea || null;
    if (note !== undefined) data.note = note || null;
    if (issuedAtRaw !== undefined) data.issued_at = parseOptionalDate(issuedAtRaw);
    if (returnDueRaw !== undefined) data.return_due = parseOptionalDate(returnDueRaw);

    const updateResult = await db.accessCredential.updateMany({
      where: { id: existing.id, company_id: user.company_id },
      data,
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ error: "Behörigheten hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "access_credential",
      entityId: existing.id,
      action: hasStatus && !hasFieldUpdate ? "access.credential.status_updated" : "access.credential.updated",
      metadata: {
        previousStatus: existing.status,
        status: nextStatus,
        holder: nextHolder,
        identifier: identifier ?? existing.identifier,
        credential_type: credentialType ?? existing.credential_type,
        storage: "AccessCredential",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Update access credential error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
