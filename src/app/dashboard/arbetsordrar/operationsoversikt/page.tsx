"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, RefreshCw, UserRoundX, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Item = { id:string; title:string; statusLabel:string; priorityLabel:string; risk:string; slaDeadline:string; scheduledStart:string|null; property:{id:string;name:string;address:string;city:string}; unit:{id:string;designation:string}|null; assignee:{id:string;name:string|null;email:string}|null; href:string };
type Data = { summary:{total:number;open:number;overdue:number;critical:number;dueSoon:number;unassigned:number}; workOrders:Item[] };
const dt = new Intl.DateTimeFormat("sv-SE", { dateStyle:"medium", timeStyle:"short" });
const riskLabel:Record<string,string> = { critical:"Kritisk", overdue:"Försenad", high:"SLA snart", medium:"Bevaka", normal:"I tid", closed:"Avslutad" };

export default function WorkOrderOperationsPage() {
  const [data,setData] = useState<Data|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [filter,setFilter]=useState("open");
  async function load(){ setLoading(true); setError(""); try { const r=await fetch("/api/work-orders/operations-overview",{cache:"no-store"}); const b=await readResponseJson(r); if(!r.ok) throw new Error(b.error||"Kunde inte hämta arbetsorderöversikten"); setData(b);} catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta arbetsorderöversikten");} finally{setLoading(false);} }
  useEffect(()=>{void load();},[]);
  const items=useMemo(()=>{const rows=data?.workOrders??[]; if(filter==="risk") return rows.filter(x=>["critical","overdue","high"].includes(x.risk)); if(filter==="unassigned") return rows.filter(x=>!x.assignee && x.risk!=="closed"); if(filter==="all") return rows; return rows.filter(x=>x.risk!=="closed");},[data,filter]);
  return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
    <header className="flex flex-col justify-between gap-4 rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:p-8"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Driftledning</p><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Arbetsorderöversikt</h1><p className="mt-3 max-w-3xl text-ink-600">Prioritera arbetsorder efter SLA, risk, ansvar och planerad leverans.</p></div><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Uppdatera</button></header>
    {error?<InlineAlert>{error}</InlineAlert>:null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><MetricCard icon={Wrench} label="Totalt" value={data?.summary.total??"–"}/><MetricCard icon={Clock3} label="Öppna" value={data?.summary.open??"–"}/><MetricCard icon={AlertTriangle} label="Försenade" value={data?.summary.overdue??"–"}/><MetricCard icon={AlertTriangle} label="Kritiska" value={data?.summary.critical??"–"}/><MetricCard icon={Clock3} label="SLA snart" value={data?.summary.dueSoon??"–"}/><MetricCard icon={UserRoundX} label="Ej tilldelade" value={data?.summary.unassigned??"–"}/></div>
    <Panel title="Operativ kö" description="SLA räknas från planerat slutdatum eller från prioritetens standardtid: akut 4 h, hög 24 h, normal 72 h och låg 7 dagar.">
      <div className="mb-4 flex flex-wrap gap-2">{[["open","Öppna"],["risk","Risk"],["unassigned","Ej tilldelade"],["all","Alla"]].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter===v?"bg-petroleum-800 text-white":"bg-sand-100 text-ink-700 hover:bg-sand-200"}`}>{l}</button>)}</div>
      {loading&&!data?<div className="h-56 animate-pulse rounded-xl bg-sand-100"/>:null}
      {!loading&&items.length===0?<EmptyState title="Inga arbetsorder i filtret" description="När arbetsorder matchar filtret visas de här."/>:null}
      {items.length?<div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">{items.map(item=><div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_190px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink-950">{item.title}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.risk==="critical"||item.risk==="overdue"?"bg-red-50 text-red-700":item.risk==="high"||item.risk==="medium"?"bg-amber-50 text-amber-800":"bg-emerald-50 text-emerald-800"}`}>{riskLabel[item.risk]||item.risk}</span></div><p className="mt-1 text-sm text-ink-500">{item.property.name} · {item.property.address}, {item.property.city}{item.unit?` · ${item.unit.designation}`:""}</p></div><div className="text-sm text-ink-600"><p><span className="font-semibold text-ink-800">Status:</span> {item.statusLabel}</p><p className="mt-1"><span className="font-semibold text-ink-800">Prioritet:</span> {item.priorityLabel}</p></div><div className="text-sm text-ink-600"><p><span className="font-semibold text-ink-800">SLA:</span> {dt.format(new Date(item.slaDeadline))}</p><p className="mt-1 truncate"><span className="font-semibold text-ink-800">Ansvarig:</span> {item.assignee?.name||item.assignee?.email||"Ej tilldelad"}</p></div><Link href={item.href} className="rounded-lg bg-petroleum-800 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-petroleum-900">Öppna</Link></div>)}</div>:null}
    </Panel>
    <div className="flex justify-end"><Link href="/dashboard/arbetsorder" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Till alla arbetsorder →</Link></div>
  </div>;
}
