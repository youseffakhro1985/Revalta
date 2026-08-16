import { Prisma } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Clock3, PackageOpen, Wrench } from "lucide-react";
import db from "@/lib/db";
import { type CurrentUser } from "@/lib/current-user";
import { DashboardSlaOperations } from "@/components/dashboard/dashboard-sla-operations";
import { MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";
import { isMissingSchemaColumnError } from "@/lib/schema-readiness";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

type DailyExecutionSummary = { total_minutes: number; material_entries: number };
type DailyPhotoSummary = { photo_count: number };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

async function loadDailyFieldSummary(companyId: string, userId: string, start: Date, end: Date) {
  try {
    const [workOrderGuard, documentGuard] = await Promise.all([
      sqlSoftDeleteGuard(db, "WorkOrder", "w"),
      sqlSoftDeleteGuard(db, "OperationalDocument", "d"),
    ]);
    const [executionRows, photoRows] = await Promise.all([
      db.$queryRaw<DailyExecutionSummary[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(e."minutes"), 0)::integer AS "total_minutes",
          COALESCE(COUNT(*) FILTER (WHERE e."entry_type" = 'material'), 0)::integer AS "material_entries"
        FROM "WorkOrderExecutionEntry" e
        INNER JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = e."company_id"
        WHERE e."company_id" = ${companyId}
          AND w."assigned_to_id" = ${userId}
          ${workOrderGuard}
          AND e."occurred_at" >= ${start}
          AND e."occurred_at" < ${end}
      `),
      db.$queryRaw<DailyPhotoSummary[]>(Prisma.sql`
        SELECT COALESCE(COUNT(*), 0)::integer AS "photo_count"
        FROM "OperationalDocument" d
        INNER JOIN "WorkOrder" w ON w."id" = d."work_order_id" AND w."company_id" = d."company_id"
        WHERE d."company_id" = ${companyId}
          AND w."assigned_to_id" = ${userId}
          ${workOrderGuard}
          ${documentGuard}
          AND d."category" IN ('before_photo', 'after_photo')
          AND d."created_at" >= ${start}
          AND d."created_at" < ${end}
      `),
    ]);
    return {
      totalMinutes: executionRows[0]?.total_minutes ?? 0,
      materialEntries: executionRows[0]?.material_entries ?? 0,
      photoCount: photoRows[0]?.photo_count ?? 0,
    };
  } catch (error) {
    if (isMissingSchemaColumnError(error)) return { totalMinutes: 0, materialEntries: 0, photoCount: 0 };
    throw error;
  }
}

export async function TechnicianDashboard({ user }: { user: CurrentUser }) {
  if (!user.company_id) {
    return <Panel title="Min dag" description="Teknikervyn kräver en aktiv organisation."><p className="text-sm text-ink-500">Kontot saknar organisationskoppling och kan därför inte läsa tilldelade arbetsordrar.</p></Panel>;
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const activeStatuses = { notIn: ["completed", "invoiced", "cancelled"] };
  const assignedScope = {
    company_id: user.company_id,
    assigned_to_id: user.id,
    deleted_at: null,
    property: { deleted_at: null },
  };

  const [activeOrderCount, activeOrders, urgentCount, completedToday, fieldSummary] = await Promise.all([
    db.workOrder.count({ where: { ...assignedScope, status: activeStatuses } }),
    db.workOrder.findMany({
      where: { ...assignedScope, status: activeStatuses },
      orderBy: [{ scheduled_start: "asc" }, { priority: "desc" }, { created_at: "asc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        work_order_number: true,
        scheduled_start: true,
        completion_due_at: true,
        sla_resolution_due_at: true,
        property: { select: { name: true, address: true, city: true } },
      },
    }),
    db.workOrder.count({ where: { ...assignedScope, status: activeStatuses, priority: "urgent" } }),
    db.workOrder.count({
      where: { ...assignedScope, status: { in: ["completed", "invoiced"] }, completed_at: { gte: startOfDay, lt: endOfDay } },
    }),
    loadDailyFieldSummary(user.company_id, user.id, startOfDay, endOfDay),
  ]);

  const nextOrder = activeOrders.find((order) => order.scheduled_start && order.scheduled_start >= now) ?? activeOrders[0] ?? null;
  const minutes = fieldSummary.totalMinutes;
  const formattedMinutes = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Teknikervy"
        title="Min dag"
        description="Dina arbetsordrar, nästa uppdrag och dagens fältdokumentation — avgränsat till arbete som är tilldelat dig."
        action={nextOrder ? <Link href={`/dashboard/arbetsorder/${nextOrder.id}`} className="inline-flex h-11 items-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800">Öppna nästa uppdrag</Link> : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Wrench} label="Mina aktiva arbetsordrar" value={activeOrderCount} hint="Endast tilldelat arbete" />
        <MetricCard icon={AlertTriangle} label="Akuta" value={urgentCount} hint="Prioritet akut" />
        <MetricCard icon={Clock3} label="Tid registrerad idag" value={formattedMinutes} hint="Från arbetsorderutförande" />
        <MetricCard icon={PackageOpen} label="Materialposter idag" value={fieldSummary.materialEntries} hint={`${fieldSummary.photoCount} fältbilder registrerade`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Nästa uppdrag" description="Närmaste schemalagda uppdrag, annars första aktiva arbetsordern.">
          {nextOrder ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-petroleum-700">{nextOrder.work_order_number || `AO-${nextOrder.id.slice(0, 8)}`}</span>
                {nextOrder.priority === "urgent" ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">Akut</span> : null}
              </div>
              <h2 className="mt-3 text-xl font-semibold text-ink-950">{nextOrder.title}</h2>
              <p className="mt-2 text-sm text-ink-600">{nextOrder.property.name} · {nextOrder.property.address}, {nextOrder.property.city}</p>
              <div className="mt-5 rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm text-ink-600">
                <p><span className="font-semibold text-ink-800">Start:</span> {nextOrder.scheduled_start ? dateTime.format(nextOrder.scheduled_start) : "Inte schemalagd"}</p>
                <p className="mt-2"><span className="font-semibold text-ink-800">Status:</span> {nextOrder.status}</p>
              </div>
              <Link href={`/dashboard/arbetsorder/${nextOrder.id}`} className="mt-5 inline-flex text-sm font-semibold text-petroleum-700">Öppna arbetsordern →</Link>
            </div>
          ) : <p className="text-sm text-ink-500">Du har inga aktiva arbetsordrar tilldelade just nu.</p>}
        </Panel>

        <Panel title="Mina arbetsordrar" description="Prioriterad lista över arbete som är tilldelat dig." bodyClassName="p-0">
          {activeOrders.length ? <div className="divide-y divide-sand-100">{activeOrders.map((order) => {
            const deadline = order.completion_due_at || order.sla_resolution_due_at;
            const overdue = deadline ? deadline < now : false;
            return (
              <Link key={order.id} href={`/dashboard/arbetsorder/${order.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-sand-50/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-semibold text-petroleum-700">{order.work_order_number || `AO-${order.id.slice(0, 8)}`}</span>{order.priority === "urgent" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Akut</span> : null}</div>
                  <p className="mt-1 truncate text-sm font-semibold text-ink-900">{order.title}</p>
                  <p className="mt-1 truncate text-xs text-ink-500">{order.property.name} · {order.property.city}</p>
                </div>
                <div className="sm:text-right"><p className={`text-xs font-semibold ${overdue ? "text-red-700" : "text-ink-600"}`}>{deadline ? `${overdue ? "Försenad · " : "Deadline · "}${dateTime.format(deadline)}` : "Ingen deadline"}</p>{order.scheduled_start ? <p className="mt-1 text-[11px] text-ink-500">Start {time.format(order.scheduled_start)}</p> : null}</div>
              </Link>
            );
          })}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga aktiva arbetsordrar.</p>}
        </Panel>
      </section>

      <DashboardSlaOperations />

      <Panel title="Fältflöde idag" description="Tid, material, bilder och avslut ligger kvar på arbetsordern så att dokumentationen följer uppdraget.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FieldStep icon={Clock3} label="Tid" value={formattedMinutes} href={nextOrder ? `/dashboard/arbetsorder/${nextOrder.id}` : "/dashboard/arbetsorder"} />
          <FieldStep icon={PackageOpen} label="Material" value={`${fieldSummary.materialEntries} poster`} href={nextOrder ? `/dashboard/arbetsorder/${nextOrder.id}` : "/dashboard/arbetsorder"} />
          <FieldStep icon={Camera} label="Bilder" value={`${fieldSummary.photoCount} idag`} href={nextOrder ? `/dashboard/arbetsorder/${nextOrder.id}` : "/dashboard/arbetsorder"} />
          <FieldStep icon={CheckCircle2} label="Avslutade" value={`${completedToday} idag`} href="/dashboard/arbetsorder" />
        </div>
      </Panel>
    </div>
  );
}

function FieldStep({ icon: Icon, label, value, href }: { icon: typeof Clock3; label: string; value: string; href: string }) {
  return <Link href={href} className="rounded-2xl border border-sand-200 bg-sand-50 p-4 outline-none transition hover:border-petroleum-200 hover:bg-petroleum-50/50 focus-visible:ring-2 focus-visible:ring-petroleum-300"><Icon className="h-5 w-5 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" /><p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p><p className="mt-1 text-lg font-semibold text-ink-950">{value}</p></Link>;
}
