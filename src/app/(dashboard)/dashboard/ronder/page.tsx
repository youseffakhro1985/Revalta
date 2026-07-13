"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Property={id:string;name:string;address:string;city:string};
type Round={id:string;title?:string;propertyName?:string;interval?:string;status?:string;nextDue?:string;checklist?:Array<{label:string;completed:boolean}>;deviations?:number};
const intervalLabels:Record<string,string>={weekly:"Varje vecka",monthly:"Varje månad",quarterly:"Varje kvartal",yearly:"Varje år"};

export default function RoundsPage(){
 const [rounds,setRounds]=useState<Round[]>([]); const [properties,setProperties]=useState<Property[]>([]); const [form,setForm]=useState({title:"",propertyId:"",interval:"monthly",checklistText:"Kontrollera entrébelysning\nKontrollera soprum\nKontrollera dörrstängare"}); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError("");try{const [rr,pr]=await Promise.all([fetch("/api/rounds",{cache:"no-store"}),fetch("/api/properties",{cache:"no-store"})]);const [rd,pd]=await Promise.all([rr.json(),pr.json()]);if(!rr.ok)throw new Error(rd.error||"Kunde inte hämta ronder");if(!pr.ok)throw new Error(pd.error||"Kunde inte hämta fastigheter");setRounds(rd.rounds||[]);setProperties(pd.properties||[]);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta ronder");}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const dueSoon=useMemo(()=>rounds.filter(r=>r.nextDue&&new Date(r.nextDue).getTime()<Date.now()+14*86400000).length,[rounds]); const deviations=useMemo(()=>rounds.reduce((s,r)=>s+Number(r.deviations||0),0),[rounds]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");try{const checklist=form.checklistText.split("\n").map(x=>x.trim()).filter(Boolean);const r=await fetch("/api/rounds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:form.title,propertyId:form.propertyId,interval:form.interval,checklist})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte skapa rond");setForm({...form,title:""});setMessage("Ronden har skapats.");await load();}catch(e){setError(e instanceof Error?e.message:"Kunde inte skapa rond");}finally{setBusy(false)}}
 return <div className="space-y-8">
  <PageHeader eyebrow="Drift och tillsyn" title="Ronder och checklistor" description="Planera återkommande tillsyn, följ kontrollpunkter och fånga avvikelser innan de blir kostsamma fel."/>
  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard icon={ClipboardCheck} label="Aktiva ronder" value={rounds.length}/><MetricCard icon={CalendarClock} label="Snart förfallna" value={dueSoon}/><MetricCard icon={AlertTriangle} label="Avvikelser" value={deviations}/></section>
  {error?<InlineAlert>{error}</InlineAlert>:null}{message?<InlineAlert tone="success">{message}</InlineAlert>:null}
  <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
   <Panel title="Skapa rond" description="Definiera intervall och kontrollpunkter för en fastighet."><form onSubmit={submit} className="space-y-4">
    <Field label="Namn"><input required className={premiumFieldClass} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex. Veckorond Brf Solgläntan"/></Field>
    <Field label="Fastighet"><select required className={premiumFieldClass} value={form.propertyId} onChange={e=>setForm({...form,propertyId:e.target.value})}><option value="">Välj fastighet</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name} – {p.city}</option>)}</select></Field>
    <Field label="Intervall"><select className={premiumFieldClass} value={form.interval} onChange={e=>setForm({...form,interval:e.target.value})}><option value="weekly">Varje vecka</option><option value="monthly">Varje månad</option><option value="quarterly">Varje kvartal</option><option value="yearly">Varje år</option></select></Field>
    <Field label="Kontrollpunkter"><textarea rows={7} className={premiumTextareaClass} value={form.checklistText} onChange={e=>setForm({...form,checklistText:e.target.value})}/><span className="mt-1.5 block text-xs text-ink-400">En kontrollpunkt per rad.</span></Field>
    <button disabled={busy} className={`${premiumPrimaryButtonClass} w-full`}>{busy?"Sparar…":"Skapa rond"}</button>
   </form></Panel>
   <Panel title="Planerade ronder" description="Samlad kontrollplan för hela beståndet." bodyClassName="p-0">
    {loading?<div className="p-8 text-sm text-ink-500">Hämtar ronder…</div>:rounds.length===0?<EmptyState title="Inga ronder skapade" description="Skapa en rond för att börja arbeta med återkommande tillsyn."/>:<div className="divide-y divide-sand-100">{rounds.map(r=>{const done=r.checklist?.filter(i=>i.completed).length||0;const total=r.checklist?.length||0;return <article key={r.id} className="p-6 transition hover:bg-sand-50/60"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-ink-900">{r.title}</h3><p className="mt-1 text-sm text-ink-500">{r.propertyName} · {intervalLabels[r.interval||"monthly"]}</p></div><span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{r.status==="completed"?"Genomförd":"Planerad"}</span></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><Mini label="Nästa datum" value={r.nextDue?new Date(r.nextDue).toLocaleDateString("sv-SE"):"Ej satt"}/><Mini label="Kontrollpunkter" value={`${done}/${total}`}/><Mini label="Avvikelser" value={String(r.deviations||0)}/></div></article>})}</div>}
   </Panel>
  </section>
 </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>}
function Mini({label,value}:{label:string;value:string}){return <div><p className="text-xs text-ink-400">{label}</p><p className="mt-1 font-semibold text-ink-800">{value}</p></div>}
