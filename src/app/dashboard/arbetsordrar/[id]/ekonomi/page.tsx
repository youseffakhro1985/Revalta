"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, BadgeDollarSign, CircleDollarSign, Percent, RefreshCw, Save, WalletCards } from "lucide-react";
import { InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Data = {
  order:{id:string;title:string;estimated_cost:string|null;actual_cost:string|null};
  settings:{internalHourlyCost:number;customerHourlyRate:number;materialMarkupPercent:number;otherCost:number;fixedRevenue:number};
  summary:{approvedMinutes:number;billableMinutes:number;laborCost:number;laborRevenue:number;materialCost:number;billableMaterial:number;materialRevenue:number;otherCost:number;fixedRevenue:number;totalCost:number;totalRevenue:number;margin:number;marginPercent:number};
  canManage:boolean;
};
const money=new Intl.NumberFormat("sv-SE",{style:"currency",currency:"SEK"});
const input="w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-petroleum-500";
function hours(minutes:number){return `${(minutes/60).toLocaleString("sv-SE",{maximumFractionDigits:1})} h`;}

export default function WorkOrderEconomyPage({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);
  const [data,setData]=useState<Data|null>(null);
  const [form,setForm]=useState({internalHourlyCost:"",customerHourlyRate:"",materialMarkupPercent:"",otherCost:"",fixedRevenue:""});
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  async function load(){setLoading(true);setError("");try{const r=await fetch(`/api/work-orders/${id}/profitability`,{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error||"Kunde inte hämta ekonomin");setData(b);setForm(Object.fromEntries(Object.entries(b.settings).map(([k,v])=>[k,String(v)])) as typeof form);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta ekonomin");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[id]);
  async function save(){setSaving(true);setError("");setMessage("");try{const r=await fetch(`/api/work-orders/${id}/profitability`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const b=await r.json();if(!r.ok)throw new Error(b.error||"Kunde inte spara ekonomin");setMessage("Ekonomiinställningarna har sparats.");await load();}catch(e){setError(e instanceof Error?e.message:"Kunde inte spara ekonomin");}finally{setSaving(false);}}
  const s=data?.summary;
  return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
    <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm"><Link href={`/dashboard/arbetsordrar/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700"><ArrowLeft className="h-4 w-4"/>Till arbetsordern</Link><div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-petroleum-600">Arbetsorder</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Ekonomi och lönsamhet</h1><p className="mt-2 text-ink-600">Samlad kostnad, intäkt, marginal och faktureringsunderlag från tid och material.</p></div><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Uppdatera</button></div></header>
    {error?<InlineAlert>{error}</InlineAlert>:null}{message?<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{message}</div>:null}
    {loading&&!data?<div className="h-72 animate-pulse rounded-2xl bg-sand-100"/>:null}
    {data&&s?<><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={CircleDollarSign} label="Total kostnad" value={money.format(s.totalCost)}/><MetricCard icon={WalletCards} label="Beräknad intäkt" value={money.format(s.totalRevenue)}/><MetricCard icon={BadgeDollarSign} label="Marginal" value={money.format(s.margin)}/><MetricCard icon={Percent} label="Marginalprocent" value={`${s.marginPercent.toLocaleString("sv-SE")} %`}/></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,.8fr)]"><div className="space-y-6"><Panel title="Kostnads- och intäktsanalys" description="Beräknas från attesterad tid, material och manuella tillägg."><div className="overflow-hidden rounded-xl border border-sand-200"><table className="w-full text-sm"><tbody className="divide-y divide-sand-200">{[["Attesterad tid",hours(s.approvedMinutes),money.format(s.laborCost)],["Debiterbar tid",hours(s.billableMinutes),money.format(s.laborRevenue)],["Materialkostnad","",money.format(s.materialCost)],["Debiterbart material inkl. påslag","",money.format(s.materialRevenue)],["Övrig kostnad","",money.format(s.otherCost)],["Fast intäkt","",money.format(s.fixedRevenue)]].map(([label,qty,value])=><tr key={label}><td className="px-4 py-3 font-medium text-ink-800">{label}</td><td className="px-4 py-3 text-right text-ink-500">{qty}</td><td className="px-4 py-3 text-right font-semibold text-ink-900">{value}</td></tr>)}</tbody></table></div></Panel><Panel title="Bedömning" description="Snabb ekonomisk kontroll av arbetsordern."><div className={`rounded-xl border p-5 ${s.margin>=0?"border-emerald-200 bg-emerald-50":"border-red-200 bg-red-50"}`}><p className="font-semibold text-ink-900">{s.margin>=0?"Arbetsordern visar positiv marginal":"Arbetsordern visar negativ marginal"}</p><p className="mt-2 text-sm text-ink-700">Intäkt {money.format(s.totalRevenue)} minus kostnad {money.format(s.totalCost)} ger {money.format(s.margin)} i marginal.</p></div></Panel></div>
    <Panel title="Beräkningsinställningar" description="Timkostnad, kundpris, materialpåslag och fasta belopp."><div className="space-y-4">{[["internalHourlyCost","Intern timkostnad"],["customerHourlyRate","Kundpris per timme"],["materialMarkupPercent","Materialpåslag (%)"],["otherCost","Övrig kostnad"],["fixedRevenue","Fast intäkt"]].map(([key,label])=><label key={key} className="block text-sm font-semibold text-ink-800">{label}<input type="number" min="0" step="0.01" className={`${input} mt-1.5`} value={form[key as keyof typeof form]} disabled={!data.canManage} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}{data.canManage?<button onClick={()=>void save()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving?"Sparar…":"Spara beräkning"}</button>:<p className="text-sm text-ink-500">Du har läsbehörighet men kan inte ändra beräkningen.</p>}</div></Panel></div></>:null}
  </div>;
}
