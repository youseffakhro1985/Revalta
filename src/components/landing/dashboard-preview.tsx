import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  CircleGauge,
  ClipboardList,
  FileText,
  Landmark,
  Search,
  Users,
} from "lucide-react";

const navigation = [
  { label: "Översikt", icon: CircleGauge, active: true },
  { label: "Fastigheter", icon: Building2 },
  { label: "Ärenden", icon: ClipboardList, count: "12" },
  { label: "Avtal", icon: FileText },
  { label: "Ekonomi", icon: Landmark },
  { label: "Statistik", icon: BarChart3 },
  { label: "Team", icon: Users },
];

const metrics = [
  { label: "Fastigheter", value: "24", detail: "318 enheter" },
  { label: "Öppna ärenden", value: "12", detail: "3 prioriterade", liveUpdate: "+1 nytt" },
  { label: "Vakansgrad", value: "1,8 %", detail: "−0,4 sedan juni" },
];

const tickets = [
  {
    title: "Vattenläcka i källare",
    property: "Kvarteret Eken 7",
    status: "Akut",
    statusClass: "border-red-200 bg-red-50 text-red-700",
  },
  {
    title: "Service av hiss, port B",
    property: "Linnégatan 42",
    status: "Pågår",
    statusClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    title: "Belysning på innergård",
    property: "Södra Vägen 18",
    status: "Planerad",
    statusClass: "border-sand-300 bg-sand-50 text-ink-600",
  },
];

export function DashboardPreview() {
  return (
    <div className="landing-dashboard-stage relative mx-auto w-full max-w-[760px] lg:mx-0">
      <div className="landing-dashboard-shadow absolute -bottom-6 left-14 right-14 h-16 rounded-full bg-petroleum-950/10 blur-2xl" aria-hidden="true" />
      <div className="landing-dashboard-float landing-dashboard-frame relative overflow-hidden rounded-[18px] border border-sand-300/80 bg-white shadow-[0_32px_90px_-42px_rgba(17,34,31,0.42),0_12px_30px_-20px_rgba(17,34,31,0.24)]">
        <div className="relative flex h-11 items-center justify-between border-b border-sand-200 bg-[#F8F8F5] px-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full border border-sand-400 bg-white" />
            <span className="h-2 w-2 rounded-full border border-sand-400 bg-white" />
            <span className="h-2 w-2 rounded-full border border-sand-400 bg-white" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-medium tracking-[0.08em] text-ink-500">
            APP.REVALTA.SE
          </span>
          <span aria-hidden="true" className="landing-demo-live flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.11em] text-petroleum-700">
            <span className="landing-demo-live-dot h-1.5 w-1.5 rounded-full bg-petroleum-500" />
            Live
          </span>
        </div>

        <div className="flex min-h-[474px]">
          <aside className="hidden w-[168px] shrink-0 border-r border-sand-200 bg-[#F7F7F3] md:flex md:flex-col">
            <div className="flex h-[58px] items-center border-b border-sand-200 px-5">
              <span className="font-display text-[15px] font-semibold tracking-[-0.03em] text-petroleum-800">
                Revalta
              </span>
            </div>
            <div className="px-3 py-4">
              <p className="mb-2 px-2 text-[8px] font-semibold uppercase tracking-[0.15em] text-ink-500">
                Förvaltning
              </p>
              <nav aria-label="Dashboardmeny" className="space-y-0.5">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[10px] font-medium ${
                        item.active
                          ? "border border-sand-200 bg-white text-petroleum-800 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"
                          : "text-ink-500"
                      } ${item.label === "Ärenden" ? "landing-demo-nav-tickets" : ""}`}
                    >
                      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.65} />
                      <span>{item.label}</span>
                      {item.count ? (
                        <span className="landing-demo-nav-count ml-auto rounded-full bg-petroleum-100 px-1.5 py-0.5 text-[8px] font-semibold text-petroleum-700">
                          {item.count}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </nav>
            </div>
            <div className="mt-auto border-t border-sand-200 p-3">
              <div className="flex items-center gap-2 rounded-lg px-2 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-petroleum-100 text-[9px] font-semibold text-petroleum-800">
                  AL
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold text-ink-800">Anna Lindberg</p>
                  <p className="truncate text-[8px] text-ink-500">Fastighetsförvaltare</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="relative min-w-0 flex-1 bg-[#FCFCFA]">
            <div aria-hidden="true" className="landing-demo-toast absolute right-4 top-[66px] z-20 hidden w-[158px] items-center gap-2 rounded-lg border border-petroleum-200 bg-white px-2.5 py-2 shadow-premium-md sm:flex">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-petroleum-50">
                <ClipboardList className="h-3 w-3 text-petroleum-700" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[8px] font-semibold text-ink-800">Nytt akutärende</span>
                <span className="mt-0.5 block truncate text-[7px] text-ink-500">Kvarteret Eken 7</span>
              </span>
            </div>

            <div className="flex h-[58px] items-center justify-between border-b border-sand-200 bg-white px-4 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-ink-500">Portfölj</span>
                <span className="text-[10px] text-sand-400">/</span>
                <span className="text-[10px] font-semibold text-ink-700">Översikt</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden h-7 w-32 items-center gap-2 rounded-md border border-sand-200 bg-sand-50 px-2.5 sm:flex">
                  <Search aria-hidden="true" className="h-3 w-3 text-ink-500" strokeWidth={1.7} />
                  <span className="text-[8px] text-ink-500">Sök i Revalta</span>
                </div>
                <div className="landing-demo-bell relative flex h-7 w-7 items-center justify-center rounded-md border border-sand-200 bg-white">
                  <Bell aria-hidden="true" className="h-3.5 w-3.5 text-ink-500" strokeWidth={1.6} />
                  <span aria-hidden="true" className="landing-demo-notification absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-white bg-petroleum-500" />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-medium text-ink-500">Tisdag 14 juli</p>
                  <h2 className="mt-1 font-display text-[19px] font-semibold tracking-[-0.025em] text-ink-950 sm:text-[21px]">
                    God morgon, Anna
                  </h2>
                  <p className="mt-1 text-[9px] text-ink-500">
                    Portföljen är stabil. Tre ärenden behöver din uppmärksamhet.
                  </p>
                </div>
                <div className="hidden h-8 items-center gap-2 rounded-md border border-sand-200 bg-white px-3 text-[9px] font-medium text-ink-600 sm:flex">
                  Hela beståndet
                  <ChevronDown aria-hidden="true" className="h-3 w-3" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className={`rounded-[10px] border border-sand-200 bg-white p-3 sm:p-3.5 ${metric.liveUpdate ? "landing-demo-live-metric" : ""}`}>
                    <p className="truncate text-[8px] font-medium text-ink-500 sm:text-[9px]">{metric.label}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <p className="font-display text-[17px] font-semibold tracking-[-0.03em] text-ink-950 sm:text-[21px]">
                        {metric.value}
                      </p>
                      {metric.liveUpdate ? (
                        <span aria-hidden="true" className="landing-demo-metric-update rounded-full bg-petroleum-50 px-1.5 py-0.5 text-[6px] font-semibold text-petroleum-700">
                          {metric.liveUpdate}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[7px] text-ink-500 sm:text-[8px]">{metric.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_0.9fr]">
                <div className="overflow-hidden rounded-[10px] border border-sand-200 bg-white">
                  <div className="flex h-10 items-center justify-between border-b border-sand-200 px-3.5">
                    <div>
                      <p className="text-[10px] font-semibold text-ink-800">Prioriterade ärenden</p>
                    </div>
                    <span className="text-[8px] font-semibold text-petroleum-700">Visa alla</span>
                  </div>
                  <div className="divide-y divide-sand-100">
                    {tickets.map((ticket, index) => (
                      <div key={ticket.title} className={`landing-demo-ticket-row flex items-center justify-between gap-3 px-3.5 py-2.5 ${index === 0 ? "landing-demo-ticket-row-new" : ""}`}>
                        <div className="min-w-0">
                          <p className="truncate text-[9px] font-medium text-ink-800">{ticket.title}</p>
                          <p className="mt-0.5 truncate text-[8px] text-ink-500">{ticket.property}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[7px] font-semibold ${index === 0 ? "landing-demo-ticket-status" : ""} ${ticket.statusClass}`}>
                          {ticket.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="landing-demo-insight hidden rounded-[10px] border border-petroleum-200 bg-petroleum-50/60 p-3.5 xl:block">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-petroleum-200 bg-white">
                      <BarChart3 aria-hidden="true" className="h-3 w-3 text-petroleum-700" strokeWidth={1.7} />
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-petroleum-900">Revalta Insikt</p>
                      <p className="flex items-center gap-1 text-[7px] text-petroleum-600">
                        <span aria-hidden="true" className="landing-demo-sync-dot h-1 w-1 rounded-full bg-petroleum-500" />
                        Uppdaterad nyss
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[9px] leading-[1.55] text-petroleum-900">
                    Energiförbrukningen i Kvarteret Eken är 8 % lägre än samma period förra året.
                  </p>
                  <div className="mt-3 flex h-12 items-end gap-1" aria-hidden="true">
                    {[44, 58, 51, 68, 62, 76, 70, 84, 78, 88].map((height, index) => (
                      <span
                        key={index}
                        className="landing-demo-chart-bar flex-1 rounded-sm bg-petroleum-300"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-dashboard-detail absolute -right-3 top-20 hidden w-[148px] rounded-xl border border-sand-200 bg-white p-3 shadow-premium-lg xl:block">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-petroleum-50">
            <Building2 aria-hidden="true" className="h-3 w-3 text-petroleum-700" strokeWidth={1.7} />
          </span>
          <div>
            <p className="text-[8px] text-ink-500">Uthyrningsgrad</p>
            <p className="text-[12px] font-semibold text-ink-900">98,2 %</p>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100">
          <div className="landing-demo-occupancy-bar h-full w-[82%] rounded-full bg-petroleum-600" />
        </div>
      </div>
    </div>
  );
}
