"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";

type Plan = { id:string; name:string; version:number; status:string; base_year:number; horizon_years:number; annual_index_rate:number; summary:string|null; assumptions:string|null };
type Action = { id:string; category:string; title:string; scope:string|null; planned_year:number; recurrence_years:number|null; estimated_cost:number; priority:string; risk:string; status:string; contractor:string|null; building_name:string|null; technical_asset_name:string|null };
type Data = { property:{name:string}; activePlan:Plan|null; actions:Action[]; forecast:null|{totals:Record<string,number>;yearly:{year:number;amount:number}[];urgent:number;overdue:number} };

const money = new Intl.NumberFormat("sv-SE", { style:"currency", currency:"SEK", maximumFractionDigits:0 });
const labels:Record<string,string>={low:"Låg",normal:"Normal",high:"Hög",urgent:"Akut",medium:"Medel",critical:"Kritisk",planned:"Planerad",approved:"Godkänd",in_progress:"Pågår",completed:"Slutförd",deferred:"Framflyttad",cancelled:"Avbruten"};

export default function MaintenanceReportPage({params}:{params:Promise<{id:string}>}){
  const [id,setId]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{void params.then(value=>setId(value.id));},[params]);
  const load=useCallback(async()=>{if(!id)return;try{const response=await fetch(`/api/properties/${id}/maintenance-plan`,{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Kunde inte hämta rapporten");setData(payload);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta rapporten");}},[id]);
  useEffect(()=>{void load();},[load]);
  const total=useMemo(()=>data?.forecast?.yearly.reduce((sum,item)=>sum+item.amount,0)||0,[data]);

  if(error)return <main className="mx-auto max-w-3xl p-10"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p></main>;
  if(!data)return <main className="mx-auto max-w-5xl p-10"><div className="h-96 animate-pulse rounded-2xl bg-sand-100"/></main>;
  if(!data.activePlan)return <main className="mx-auto max-w-3xl p-10"><p>Ingen underhållsplan finns för fastigheten.</p></main>;

  return <main className="min-h-screen bg-sand-50 px-5 py-8 text-ink-900 print:bg-white print:p-0">
    <article className="mx-auto max-w-[1100px] rounded-2xl border border-sand-200 bg-white p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none sm:p-12">
      <div className="mb-10 flex items-start justify-between gap-6 print:hidden"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-petroleum-700">Revalta · Underhållsrapport</p><h1 className="mt-2 text-3xl font-semibold">{data.property.name}</h1></div><button onClick={()=>window.print()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white"><Printer className="h-4 w-4"/>Skriv ut / spara PDF</button></div>

      <header className="border-b border-sand-200 pb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-petroleum-700">Revalta</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Underhållsplan</h1><p className="mt-3 text-xl text-ink-600">{data.property.name}</p><div className="mt-6 grid gap-4 text-sm sm:grid-cols-4"><Fact label="Plan" value={`${data.activePlan.name} · v${data.activePlan.version}`}/><Fact label="Period" value={`${data.activePlan.base_year}–${data.activePlan.base_year+data.activePlan.horizon_years-1}`}/><Fact label="Indexering" value={`${data.activePlan.annual_index_rate}% per år`}/><Fact label="Planerat behov" value={money.format(total)}/></div></header>

      <section className="mt-10"><h2 className="text-2xl font-semibold">Sammanfattning</h2><p className="mt-3 max-w-4xl text-sm leading-7 text-ink-600">{data.activePlan.summary||"Underhållsplanen sammanställer fastighetens långsiktiga åtgärder, risker och investeringsbehov."}</p>{data.activePlan.assumptions?<p className="mt-3 text-sm leading-7 text-ink-500"><strong>Antaganden:</strong> {data.activePlan.assumptions}</p>:null}</section>

      <section className="mt-10 grid gap-4 sm:grid-cols-4">{[5,10,20,30].map(year=><div key={year} className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-medium text-ink-500">{year}-årsbehov</p><p className="mt-2 text-xl font-semibold">{money.format(data.forecast?.totals[String(year)]||0)}</p></div>)}</section>

      <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">Årsvis budget</h2><p className="mt-1 text-sm text-ink-500">Indexerade kostnader enligt aktiv planversion.</p></div><p className="text-sm font-semibold">{data.forecast?.urgent||0} kritiska · {data.forecast?.overdue||0} försenade</p></div><div className="mt-5 overflow-hidden rounded-xl border border-sand-200"><table className="w-full text-left text-sm"><thead className="bg-sand-50 text-ink-500"><tr><th className="px-4 py-3">År</th><th className="px-4 py-3 text-right">Budget</th></tr></thead><tbody>{data.forecast?.yearly.map(item=><tr key={item.year} className="border-t border-sand-100"><td className="px-4 py-3 font-medium">{item.year}</td><td className="px-4 py-3 text-right font-semibold">{money.format(item.amount)}</td></tr>)}</tbody></table></div></section>

      <section className="mt-10"><h2 className="text-2xl font-semibold">Planerade åtgärder</h2><div className="mt-5 overflow-hidden rounded-xl border border-sand-200"><table className="w-full text-left text-xs"><thead className="bg-sand-50 text-ink-500"><tr><th className="px-3 py-3">År</th><th className="px-3 py-3">Åtgärd</th><th className="px-3 py-3">Omfattning</th><th className="px-3 py-3">Risk</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Kostnad</th></tr></thead><tbody>{data.actions.map(item=><tr key={item.id} className="border-t border-sand-100 align-top"><td className="px-3 py-3 font-semibold">{item.planned_year}</td><td className="px-3 py-3"><p className="font-semibold">{item.title}</p><p className="mt-1 text-ink-500">{item.category}{item.building_name?` · ${item.building_name}`:""}{item.technical_asset_name?` · ${item.technical_asset_name}`:""}</p></td><td className="max-w-xs px-3 py-3 text-ink-600">{item.scope||"–"}</td><td className="px-3 py-3">{labels[item.risk]||item.risk}</td><td className="px-3 py-3">{labels[item.status]||item.status}</td><td className="px-3 py-3 text-right font-semibold">{money.format(item.estimated_cost)}</td></tr>)}</tbody></table></div></section>

      <footer className="mt-12 border-t border-sand-200 pt-5 text-xs text-ink-400">Rapport genererad i Revalta · {new Intl.DateTimeFormat("sv-SE",{dateStyle:"long"}).format(new Date())}</footer>
    </article>
  </main>;
}

function Fact({label,value}:{label:string;value:string}){return <div><p className="text-xs text-ink-400">{label}</p><p className="mt-1 font-semibold text-ink-800">{value}</p></div>}
