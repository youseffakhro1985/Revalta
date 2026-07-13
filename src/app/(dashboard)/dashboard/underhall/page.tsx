"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, WalletCards } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Property={id:string;name:string;address:string;city:string};
type Item={id:string;property_id:string;property_name:string;component:string;measure:string;planned_year:number;estimated_cost:number;priority:string;interval_years:number;status:string};
const currency=new Intl.NumberFormat("sv-SE",{style:"currency",currency:"SEK",maximumFractionDigits:0});
const priorityLabel:Record<string,string>={low:"Låg",normal:"Normal",high:"Hög",critical:"Kritisk"};

export default function MaintenancePage(){
 const [items,setItems]=useState<Item[]>([]); const [properties,setProperties]=useState<Property[]>([]); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 const [form,setForm]=useState({propertyId:"",component:"",measure:"",plannedYear:String(new Date().getFullYear()+1),estimatedCost:"",priority:"normal",intervalYears:"0"});
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/maintenance",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte hämta underhållsplanen");setItems(d.items||[]);setProperties(d.properties||[]);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta underhållsplanen");}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const year=new Date().getFullYear(); const debt=useMemo(()=>items.filter(i=>i.planned_year<year&&i.status!=="completed").reduce((s,i)=>s+Number(i.estimated_cost||0),0),[items,year]); const tenYear=useMemo(()=>items.filter(i=>i.planned_year>=year&&i.planned_year<=year+10).reduce((s,i)=>s+Number(i.estimated_cost||0),0),[items,year]); const critical=items.filter(i=>["critical","high"].includes(i.priority)).length;
 const grouped=useMemo(()=>{const m=new Map<number,Item[]>();for(const i of items)m.set(i.planned_year,[...(m.get(i.planned_year)||[]),i]);return[...m.entries()].sort(([a],[b])=>a-b)},[items]);
 async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");setMessage("");try{const r=await fetch("/api/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,plannedYear:Number(form.plannedYear),estimatedCost:Number(form.estimatedCost),intervalYears:Number(form.intervalYears)})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte lägga till åtgärden");setForm({...form,component:"",measure:"",estimatedCost:""});setMessage("Åtgärden har lagts till i underhållsplanen.");await load();}catch(e){setError(e instanceof Error?e.message:"Kunde inte lägga till åtgärden");}finally{setSaving(false)}}
 return <div className="space-y-8">
  <PageHeader eyebrow="Teknisk förvaltning" title="Underhållsplan" description="Planera byggnadsdelar, åtgärder och investeringar med tydlig kostnadsprognos och kontroll över underhållsskulden."/>
  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard icon={WalletCards} label="10-årsplan" value={currency.format(tenYear)}/><MetricCard icon={CalendarRange} label="Underhållsskuld" value={currency.format(debt)}/><MetricCard icon={AlertTriangle} label="Hög prioritet" value={critical}/></section>
  {error?<InlineAlert>{error}</InlineAlert>:null}{message?<InlineAlert tone="success">{message}</InlineAlert>:null}
  <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
   <Panel title="Ny planerad åtgärd" description="Koppla åtgärden till rätt fastighet, år och prioritet."><form onSubmit={submit} className="space-y-4">
    <Field label="Fastighet"><select required className={premiumFieldClass} value={form.propertyId} onChange={e=>setForm({...form,propertyId:e.target.value})}><option value="">Välj fastighet</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="Byggnadsdel"><input required className={premiumFieldClass} value={form.component} onChange={e=>setForm({...form,component:e.target.value})} placeholder="Ex. Tak, fasad eller ventilation"/></Field>
    <Field label="Åtgärd"><textarea required className={premiumTextareaClass} value={form.measure} onChange={e=>setForm({...form,measure:e.target.value})} placeholder="Beskriv planerad åtgärd"/></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Planerat år"><input required type="number" className={premiumFieldClass} value={form.plannedYear} onChange={e=>setForm({...form,plannedYear:e.target.value})}/></Field><Field label="Intervall, år"><input type="number" min="0" className={premiumFieldClass} value={form.intervalYears} onChange={e=>setForm({...form,intervalYears:e.target.value})}/></Field></div>
    <Field label="Beräknad kostnad exkl. moms"><input required type="number" min="0" className={premiumFieldClass} value={form.estimatedCost} onChange={e=>setForm({...form,estimatedCost:e.target.value})} placeholder="0"/></Field>
    <Field label="Prioritet"><select className={premiumFieldClass} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="critical">Kritisk</option></select></Field>
    <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving?"Sparar…":"Lägg till i planen"}</button>
   </form></Panel>
   <Panel title="Planerade åtgärder" description={`${items.length} åtgärder i hela beståndet`} bodyClassName="p-0">
    {loading?<div className="p-8 text-sm text-ink-500">Hämtar underhållsplan…</div>:grouped.length===0?<EmptyState title="Inga planerade åtgärder" description="Lägg till en åtgärd för att bygga en långsiktig underhållsplan."/>:<div className="divide-y divide-sand-100">{grouped.map(([y,rows])=><div key={y} className="grid md:grid-cols-[110px_1fr]"><div className="bg-sand-50 p-5 text-2xl font-semibold text-petroleum-800">{y}</div><div className="divide-y divide-sand-100">{rows.map(i=><article key={i.id} className="p-5 transition hover:bg-sand-50/60"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">{i.property_name}</p><h3 className="mt-1 text-lg font-semibold text-ink-900">{i.component}</h3><p className="mt-1 text-sm leading-6 text-ink-500">{i.measure}</p></div><div className="sm:text-right"><p className="font-semibold text-ink-900">{currency.format(i.estimated_cost)}</p><p className="mt-1 text-xs text-ink-400">{priorityLabel[i.priority]||i.priority}{i.interval_years?` · vart ${i.interval_years}:e år`:""}</p></div></div></article>)}</div></div>)}</div>}
   </Panel>
  </section>
 </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>}
