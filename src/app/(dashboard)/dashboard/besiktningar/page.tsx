"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardSignature } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Property={id:string;name:string;address:string;city:string};
type Inspection={id:string;property_id?:string;property_name?:string;type?:string;title?:string;due_date?:string;responsible?:string;supplier?:string;interval_months?:number;status?:string;note?:string;created_at:string};
const typeLabels:Record<string,string>={ovk:"OVK",sba:"SBA",elevator:"Hiss",energy:"Energideklaration",radon:"Radon",pressure:"Trycksatta anordningar",playground:"Lekplats",electrical:"Elrevision",other:"Övrig kontroll"};
const statusLabels:Record<string,string>={planned:"Planerad",booked:"Bokad",completed:"Genomförd",action_required:"Åtgärd krävs"};
function daysUntil(value?:string){if(!value)return Number.POSITIVE_INFINITY;const due=new Date(`${value}T00:00:00`);const today=new Date();today.setHours(0,0,0,0);return Math.ceil((due.getTime()-today.getTime())/86400000)}

export default function InspectionsPage(){
 const [inspections,setInspections]=useState<Inspection[]>([]);const [properties,setProperties]=useState<Property[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");
 const [form,setForm]=useState({propertyId:"",type:"ovk",title:"",dueDate:"",responsible:"",supplier:"",intervalMonths:"36",status:"planned",note:""});
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/inspections",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte hämta besiktningar");setInspections(d.inspections||[]);setProperties(d.properties||[]);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta besiktningar");}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const summary=useMemo(()=>({overdue:inspections.filter(i=>i.status!=="completed"&&daysUntil(i.due_date)<0).length,upcoming:inspections.filter(i=>i.status!=="completed"&&daysUntil(i.due_date)>=0&&daysUntil(i.due_date)<=60).length,action:inspections.filter(i=>i.status==="action_required").length,completed:inspections.filter(i=>i.status==="completed").length}),[inspections]);
 async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");setSuccess("");try{const r=await fetch("/api/inspections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Kunde inte spara kontrollen");setForm({propertyId:"",type:"ovk",title:"",dueDate:"",responsible:"",supplier:"",intervalMonths:"36",status:"planned",note:""});setSuccess("Kontrollen har lagts till i kontrollplanen.");await load();}catch(e){setError(e instanceof Error?e.message:"Kunde inte spara kontrollen");}finally{setSaving(false)}}
 const sorted=[...inspections].sort((a,b)=>String(a.due_date||"").localeCompare(String(b.due_date||"")));
 return <div className="space-y-8">
  <PageHeader eyebrow="Efterlevnad och kontroll" title="Besiktningar och myndighetskrav" description="Samla OVK, SBA, hisskontroller, energideklarationer, radon och andra återkommande krav i en trygg och tydlig bevakning."/>
  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={AlertTriangle} label="Försenade" value={summary.overdue}/><MetricCard icon={CalendarClock} label="Inom 60 dagar" value={summary.upcoming}/><MetricCard icon={ClipboardSignature} label="Åtgärd krävs" value={summary.action}/><MetricCard icon={CheckCircle2} label="Genomförda" value={summary.completed}/></section>
  {error?<InlineAlert>{error}</InlineAlert>:null}{success?<InlineAlert tone="success">{success}</InlineAlert>:null}
  <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
   <Panel title="Ny kontroll" description="Lägg in förfallodatum, ansvarig och återkommande intervall."><form onSubmit={submit} className="space-y-4">
    <Field label="Fastighet"><select required className={premiumFieldClass} value={form.propertyId} onChange={e=>setForm({...form,propertyId:e.target.value})}><option value="">Välj fastighet</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="Kontrolltyp"><select className={premiumFieldClass} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{Object.entries(typeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
    <Field label="Namn"><input required className={premiumFieldClass} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Kontroll eller besiktning"/></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Förfallodatum"><input required type="date" className={premiumFieldClass} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></Field><Field label="Intervall, månader"><input type="number" min="0" max="240" className={premiumFieldClass} value={form.intervalMonths} onChange={e=>setForm({...form,intervalMonths:e.target.value})}/></Field></div>
    <Field label="Ansvarig internt"><input className={premiumFieldClass} value={form.responsible} onChange={e=>setForm({...form,responsible:e.target.value})} placeholder="Namn eller funktion"/></Field>
    <Field label="Besiktningsföretag"><input className={premiumFieldClass} value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Leverantör eller företag"/></Field>
    <Field label="Status"><select className={premiumFieldClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
    <Field label="Anteckning"><textarea className={premiumTextareaClass} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Anteckning eller krav"/></Field>
    <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving?"Sparar…":"Spara kontroll"}</button>
   </form></Panel>
   <Panel title="Kontrollplan" description="Kommande krav sorterade efter förfallodatum." bodyClassName="p-0">
    {loading?<div className="p-8 text-sm text-ink-500">Hämtar kontroller…</div>:sorted.length===0?<EmptyState title="Inga besiktningar registrerade" description="Lägg till den första kontrollen för att börja bevaka myndighetskrav."/>:<div className="divide-y divide-sand-100">{sorted.map(i=>{const days=daysUntil(i.due_date);const urgent=i.status!=="completed"&&days<=60;return <article key={i.id} className="p-6 transition hover:bg-sand-50/60"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{i.title}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{typeLabels[i.type||"other"]}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${urgent?"bg-red-50 text-red-700":"bg-petroleum-50 text-petroleum-700"}`}>{statusLabels[i.status||"planned"]}</span></div><p className="mt-1 text-sm text-ink-500">{i.property_name}{i.supplier?` · ${i.supplier}`:""}</p></div><div className="sm:text-right"><p className="text-sm font-semibold text-ink-900">{i.due_date?new Date(`${i.due_date}T00:00:00`).toLocaleDateString("sv-SE"):"—"}</p><p className={`mt-1 text-xs ${urgent?"text-red-700":"text-ink-400"}`}>{days<0?`${Math.abs(days)} dagar försenad`:days===0?"Förfaller idag":`${days} dagar kvar`}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs text-ink-500 md:grid-cols-3"><Mini label="Ansvarig" value={i.responsible||"Ej utsedd"}/><Mini label="Intervall" value={Number(i.interval_months||0)?`${i.interval_months} månader`:"Engångskontroll"}/><Mini label="Anteckning" value={i.note||"Ingen anteckning"}/></div></article>})}</div>}
   </Panel>
  </section>
 </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>}
function Mini({label,value}:{label:string;value:string}){return <span>{label}<strong className="mt-1 block text-ink-800">{value}</strong></span>}
