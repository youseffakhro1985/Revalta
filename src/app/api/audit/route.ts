import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewAudit, getCurrentUser } from "@/lib/current-user";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

function parsePositiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function csvCell(value: unknown) {
  const normalized = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return `"${normalized.replaceAll('"', '""')}"`;
}

function createAuditCsv(rows: Array<{
  created_at: Date;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: Prisma.JsonValue | null;
  actor: { name: string | null; email: string } | null;
}>) {
  const header = ["Tidpunkt", "Händelsetyp", "Objekt-ID", "Åtgärd", "Utförd av", "E-post", "Metadata"];
  const lines = rows.map((row) => [
    row.created_at.toISOString(),
    row.entity_type,
    row.entity_id,
    row.action,
    row.actor?.name || "System",
    row.actor?.email || "",
    row.metadata,
  ].map(csvCell).join(";"));

  return `\uFEFF${header.map(csvCell).join(";")}\n${lines.join("\n")}`;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewAudit(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa systemloggen" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const pageSize = parsePositiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const entityType = searchParams.get("entityType")?.trim() || "";
    const action = searchParams.get("action")?.trim() || "";
    const actor = searchParams.get("actor")?.trim() || "";
    const format = searchParams.get("format")?.trim().toLowerCase() || "json";

    const tenantFilter: Prisma.AuditLogWhereInput = user.company_id
      ? { company_id: user.company_id }
      : { actor_user_id: user.id };

    const filters: Prisma.AuditLogWhereInput[] = [tenantFilter];

    if (entityType) filters.push({ entity_type: entityType });
    if (action) {
      filters.push({ action: { contains: action, mode: Prisma.QueryMode.insensitive } });
    }
    if (actor) {
      filters.push({
        actor: {
          is: {
            OR: [
              { name: { contains: actor, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: actor, mode: Prisma.QueryMode.insensitive } },
            ],
          },
        },
      });
    }

    const where: Prisma.AuditLogWhereInput = { AND: filters };

    if (format === "csv") {
      const rows = await db.auditLog.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: MAX_EXPORT_ROWS,
        select: {
          created_at: true,
          entity_type: true,
          entity_id: true,
          action: true,
          metadata: true,
          actor: { select: { name: true, email: true } },
        },
      });
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(createAuditCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="revalta-systemlogg-${date}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (format !== "json") {
      return NextResponse.json({ error: "Formatet stöds inte" }, { status: 400 });
    }

    const [auditLogs, total, entityTypes] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          entity_type: true,
          entity_id: true,
          action: true,
          metadata: true,
          created_at: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where: tenantFilter,
        distinct: ["entity_type"],
        orderBy: { entity_type: "asc" },
        select: { entity_type: true },
        take: 100,
      }),
    ]);

    return NextResponse.json({
      auditLogs,
      filters: { entityTypes: entityTypes.map((item) => item.entity_type) },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("Get audit log error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
