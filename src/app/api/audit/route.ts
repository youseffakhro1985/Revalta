import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewAudit, getCurrentUser } from "@/lib/current-user";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
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

    const tenantFilter: Prisma.AuditLogWhereInput = user.company_id
      ? { company_id: user.company_id }
      : { actor_user_id: user.id };

    const where: Prisma.AuditLogWhereInput = {
      ...tenantFilter,
      ...(entityType ? { entity_type: entityType } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(actor
        ? {
            actor: {
              is: {
                OR: [
                  { name: { contains: actor, mode: "insensitive" } },
                  { email: { contains: actor, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
    };

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
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
