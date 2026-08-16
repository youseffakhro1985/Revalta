import db from "@/lib/db";
import {
  canViewLeasingData,
  companyUserWhere,
  getCurrentUser,
  shouldScopeToAssignedWork,
  tenantWhere,
} from "@/lib/current-user";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/search" });

function searchResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return searchResponse({ error: "Obehörig" }, 401);

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    if (query.length < 2) return searchResponse({ results: [] });

    const contains = { contains: query, mode: "insensitive" as const };
    const includeDirectory = canViewLeasingData(user.role);
    const scopedToAssigned = shouldScopeToAssignedWork(user.role);

    const [properties, tickets, workOrders, users, leaseHolders] = await Promise.all([
      db.property.findMany({
        where: {
          deleted_at: null,
          ...tenantWhere(user),
          OR: [
            { name: contains },
            { address: contains },
            { city: contains },
            { property_identifier: contains },
          ],
        },
        take: 6,
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
      db.ticket.findMany({
        where: {
          deleted_at: null,
          ...tenantWhere(user),
          ...(scopedToAssigned ? { assigned_to_id: user.id } : {}),
          AND: [
            { OR: [{ property_id: null }, { property: { deleted_at: null } }] },
            {
              OR: [
                { title: contains },
                { description: contains },
                { public_reference: contains },
                { reporter_name: contains },
              ],
            },
          ],
        },
        take: 8,
        orderBy: { updated_at: "desc" },
        select: { id: true, title: true, status: true, public_reference: true, property: { select: { name: true } } },
      }),
      user.company_id
        ? db.workOrder.findMany({
            where: {
              company_id: user.company_id,
              deleted_at: null,
              property: { deleted_at: null },
              ...(scopedToAssigned ? { assigned_to_id: user.id } : {}),
              OR: [
                { title: contains },
                { description: contains },
                { work_order_number: contains },
              ],
            },
            take: 8,
            orderBy: { updated_at: "desc" },
            select: {
              id: true,
              title: true,
              status: true,
              work_order_number: true,
              property: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      includeDirectory
        ? db.user.findMany({
            where: {
              ...companyUserWhere(user),
              OR: [{ name: contains }, { email: contains }],
            },
            take: 5,
            orderBy: { name: "asc" },
            select: { id: true, name: true, email: true, role: true },
          })
        : Promise.resolve([]),
      includeDirectory && user.company_id
        ? db.leaseHolder.findMany({
            where: {
              deleted_at: null,
              company_id: user.company_id,
              status: "active",
              OR: [{ name: contains }, { contact_name: contains }, { email: contains }, { organization_number: contains }],
            },
            take: 6,
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              email: true,
              organization_number: true,
              leases: {
                where: { deleted_at: null, status: { in: ["reserved", "active", "notice"] }, property: { deleted_at: null } },
                orderBy: { updated_at: "desc" },
                take: 1,
                select: { lease_number: true, unit: { select: { designation: true } }, property: { select: { name: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const results = [
      ...properties.map((item) => ({
        id: item.id,
        type: "property",
        title: item.name,
        subtitle: `${item.address}, ${item.city}`,
        href: `/dashboard/fastigheter/${item.id}`,
      })),
      ...tickets.map((item) => ({
        id: item.id,
        type: "ticket",
        title: item.title,
        subtitle: [item.public_reference, item.property?.name, item.status].filter(Boolean).join(" · "),
        href: `/dashboard/felanmalan/${item.id}`,
      })),
      ...workOrders.map((item) => ({
        id: item.id,
        type: "work_order",
        title: item.title,
        subtitle: [item.work_order_number, item.property.name, item.status].filter(Boolean).join(" · "),
        href: `/dashboard/arbetsorder/${item.id}`,
      })),
      ...users.map((item) => ({
        id: item.id,
        type: "user",
        title: item.name || item.email,
        subtitle: `${item.email} · ${item.role}`,
        href: "/dashboard/team",
      })),
      ...leaseHolders.map((item) => ({
        id: item.id,
        type: "lease_holder",
        title: item.name,
        subtitle: item.leases[0]
          ? [item.leases[0].property.name, item.leases[0].unit.designation, item.leases[0].lease_number].join(" · ")
          : item.organization_number || item.email || "Hyrespart",
        href: "/dashboard/uthyrning",
      })),
    ];

    return searchResponse({ results });
  } catch (error) {
    logger.error("Global search error", error);
    return searchResponse({ error: "Sökningen kunde inte genomföras" }, 500);
  }
}
