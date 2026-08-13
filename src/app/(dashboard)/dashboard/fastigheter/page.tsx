"use client";
import { readResponseJson } from "@/lib/fetch-json";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, DoorOpen, MapPin } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";

type Property = { id:string; name:string; address:string; postal_code:string|null; city:string; property_identifier:string|null; property_type:string; status:string; created_at:string; _count:{tickets:number;buildings:number;units:number} };
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function PropertiesPage() {
  const [form,setForm]=useState({name:"",address:"",postalCode:"",city:""});
  const [properties,setProperties]=useState<Property[]>([]);
  const [canCreate,setCanCreate]=useState(false);
  const [loading,setLoading]=useState(true); const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState(""); const router=useRouter();

  useEffect(()=>{let mounted=true;(async()=>{try{const r=await fetch("/api/properties",{cache:"no-store"});if(r.status===401){router.push("/login");return;}const d=await readResponseJson(r);if(!mounted)return;if(!r.ok)throw new Error(d.error||"Kunde inte hämta fastigheter");setProperties(d.properties||[]);setCanCreate(Boolean(d.permissions?.canCreate));}catch(e){if(mounted)setError(e instanceof Error?e.message:"Kunde inte kontakta servern");}finally{if(mounted)setLoading(false);}})();return()=>{mounted=false};},[router]);

  const totals=useMemo(()=>({buildings:properties.reduce((s,p)=>s+p._count.buildings,0),units:properties.reduce((s,p)=>s+p._count.units,0),tickets:properties.reduce((s,p)=>s+p._count.tickets,0)}),[properties]);

  async function submit(e:React.FormEvent){e.preventDefault();setError("");setSuccess("");setSubmitting(true);try{const r=await fetch("/api/properties",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await readResponseJson(r);if(r.status===401){router.push("/login");return;}if(!r.ok)throw new Error(d.error||"Kunde inte skapa fastigheten");setProperties(c=>[d.property,...c]);setForm({name:"",address:"",postalCode:"",city:""});setSuccess("Fastigheten är skapad och redo för byggnader, objekt och förvaltningsdata.");}catch(e){setError(e instanceof Error?e.message:"Kunde inte kontakta servern");}finally{setSubmitting(false);}}

  return <div className="space-y-8">
    <PageHeader eyebrow="Bestånd och struktur" title="Fastighetsregister" description="Samla fastigheter, byggnader, lägenheter, lokaler och ärenden i en tydlig och enhetlig förvaltningsstruktur." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Building2} label="Fastigheter" value={properties.length} />
      <MetricCard icon={Building2} label="Byggnader" value={totals.buildings} />
      <MetricCard icon={DoorOpen} label="Objekt" value={totals.units} />
      <MetricCard label="Aktiva ärenden" value={totals.tickets} />
    </section>
    {error?<InlineAlert>{error}</InlineAlert>:null}{success?<InlineAlert tone="success">{success}</InlineAlert>:null}
    <SoftDeleteUndoBanner entityLabel="Fastigheten" restoreApiPath={(id)=>`/api/properties/${id}/restore`} detailPath={(id)=>`/dashboard/fastigheter/${id}`} />
    <section className={`grid gap-6 ${canCreate ? "xl:grid-cols-[380px_1fr]" : ""}`}>
      {canCreate ? <Panel title="Lägg till fastighet" description="Registrera grunduppgifterna. Detaljer fylls i på fastighetskortet.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Namn"><input required minLength={2} className={premiumFieldClass} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex. Brf Solgläntan"/></Field>
          <Field label="Adress"><input required minLength={3} className={premiumFieldClass} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Ex. Storgatan 12"/></Field>
          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]"><Field label="Postnummer"><input className={premiumFieldClass} value={form.postalCode} onChange={e=>setForm({...form,postalCode:e.target.value})} placeholder="111 22"/></Field><Field label="Ort"><input required minLength={2} className={premiumFieldClass} value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Göteborg"/></Field></div>
          <button disabled={submitting} className={`${premiumPrimaryButtonClass} w-full`}>{submitting?"Sparar fastighet…":"Spara fastighet"}</button>
        </form>
      </Panel> : null}
      <Panel title="Bestånd" description="Öppna ett fastighetskort för att arbeta vidare med byggnader, objekt och förvaltningsdata." bodyClassName="p-0">
        {loading?<div className="space-y-4 p-6">{[1,2,3].map(i=><div key={i} className="h-28 animate-pulse rounded-2xl bg-sand-100"/>)}</div>:properties.length===0?<EmptyState title="Inga fastigheter registrerade" description="Lägg till den första fastigheten för att börja bygga beståndet."/>:<div className="divide-y divide-sand-100">{properties.map(p=><Link key={p.id} href={`/dashboard/fastigheter/${p.id}`} className="group block p-6 transition hover:bg-sand-50/70">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-ink-900">{p.name}</h3><span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{p.status==="active"?"Aktiv":p.status}</span></div><p className="mt-2 flex items-center gap-2 text-sm text-ink-500"><MapPin className="h-4 w-4 text-petroleum-600"/>{p.address}{p.postal_code?`, ${p.postal_code}`:""} {p.city}</p>{p.property_identifier?<p className="mt-2 text-xs text-ink-500">{p.property_identifier}</p>:null}</div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-ink-300 transition group-hover:translate-x-1 group-hover:text-petroleum-700"/></div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-sm"><Mini label="Byggnader" value={p._count.buildings}/><Mini label="Objekt" value={p._count.units}/><Mini label="Ärenden" value={p._count.tickets}/></div><p className="mt-4 text-xs text-ink-500">Registrerad {dateFormatter.format(new Date(p.created_at))}</p>
        </Link>)}</div>}
      </Panel>
    </section>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>}
function Mini({label,value}:{label:string;value:number}){return <div className="rounded-xl bg-sand-50 px-3 py-2"><p className="text-[11px] text-ink-500">{label}</p><p className="mt-1 font-semibold text-ink-900">{value}</p></div>}
