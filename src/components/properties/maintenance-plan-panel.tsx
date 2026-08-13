"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, CircleDollarSign, Plus, TrendingUp } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Plan = { id:string; name:string; version:number; status:string; base_year:number; horizon_years:number; annual_index_rate:number; summary:string|null; assumptions:string|null };
type Action = { id:string; category:string; title:string; description:string|null; scope:string|null; planned_year:number; recurrence_years:number|null; technical_lifetime_years:number|null; estimated_cost:number; annual_index_rate:number|null; priority:string; risk:string; status:string; contractor:string|null; building_name:string|null; technical_asset_name:string|null };
type Data = {
  property:{ id:string; name:string; buildings:{id:string;name:string}[] };
  plans:Plan[];
  activePlan:Plan|null;
  actions:Action[];
  assets:{id:string;name:string}[];
  forecast:null|{totals:Record<string,number>;yearly:{year:number;amount:number}[];urgent:number;overdue:number};
};

const money = new Intl.NumberFormat("sv-SE", { style:"currency", currency:"SEK", maximumFractionDigits:0 });
const priorityLabels:Record<string,string>={low:"Låg",normal:"Normal",high:"Hög",urgent:"Akut"};
const riskLabels:Record<string,string>={low:"Låg",medium:"Medel",high:"Hög",critical:"Kritisk"};
const statusLabels:Record<string,string>={draft:"Utkast",active:"Aktiv",archived:"Arkiverad",planned:"Planerad",approved:"Godkänd",in_progress:"Pågår",completed:"Klar",deferred:"Framflyttad",cancelled:"Avbruten"};
const categories=["Tak","Fasad","Fönster","Ventilation","Värme","El","VA","Hiss","Brandskydd","Mark","Invändigt","Energi","Övrigt"];

function Badge({value,type}:{value:string;type:"risk"|"priority"|"status"}){
  const warning=["urgent","critical","high","overdue"].includes(value);
  const label=type==="risk"?riskLabels[value]:type==="priority"?priorityLabels[value]:statusLabels[value];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${warning?"bg-amber-50 text-amber-800":"bg-petroleum-50 text-petroleum-800"}`}>{label||value}</span>;
}

export function MaintenancePlanPanel({propertyId}:{propertyId:string}){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [mode,setMode]=useState<"action"|"plan">("action");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{const r=await fetch(`/api/properties/${propertyId}/maintenance-plan`,{cache:"no-store"});const p=await readResponseJson(r);if(!r.ok)throw new Error(p.error||"Kunde inte hämta underhållsplanen");setData(p);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta underhållsplanen");}finally{setLoading(false);}
  },[propertyId]);
  useEffect(()=>{void load();},[load]);

  const maxYear=useMemo(()=>Math.max(1,...(data?.forecast?.yearly.map(i=>i.amount)||[1])),[data]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError("");setSuccess("");
    try{
      const form=new FormData(event.currentTarget);const body=Object.fromEntries(form.entries());
      const r=await fetch(`/api/properties/${propertyId}/maintenance-plan`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const p=await readResponseJson(r);if(!r.ok)throw new Error(p.error||"Kunde inte spara");
      event.currentTarget.reset();setSuccess(mode==="plan"?"Underhållsplanen har skapats.":"Åtgärden har lagts till.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Kunde inte spara");}finally{setSaving(false);}
  }

  async function activate(planId:string){
    setSaving(true);setError("");setSuccess("");
    try{const r=await fetch(`/api/properties/${propertyId}/maintenance-plan`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"plan.activate",planId})});const p=await readResponseJson(r);if(!r.ok)throw new Error(p.error||"Kunde inte aktivera planen");setSuccess("Planen är nu aktiv.");await load();}catch(e){setError(e instanceof Error?e.message:"Kunde inte aktivera planen");}finally{setSaving(false);}
  }

  if(loading)return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-sand-100"/><div className="h-96 animate-pulse rounded-2xl bg-sand-100"/></div>;
  if(!data)return <InlineAlert>{error||"Underhållsplanen kunde inte laddas."}</InlineAlert>;

  return <section className="space-y-6" aria-labelledby="maintenance-heading">
    <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Strategiskt underhåll</p><h2 id="maintenance-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Underhållsplan</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Planera åtgärder, kostnader och risker över 5, 10, 20 och 30 år med indexerade prognoser.</p></div>
    {(error||success)?<InlineAlert tone={error?"error":"success"}>{error||success}</InlineAlert>:null}

    {data.activePlan&&data.forecast?<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[5,10,20,30].map(years=><MetricCard key={years} icon={years===5?CircleDollarSign:TrendingUp} label={`${years}-årsbehov`} value={money.format(data.forecast!.totals[String(years)]||0)} hint={years<=data.activePlan!.horizon_years?`Från basår ${data.activePlan!.base_year}`:"Utanför vald horisont"}/>) }
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Årsvis investeringsbehov" description={`Indexerat med ${data.activePlan.annual_index_rate}% per år.`}>
          {data.forecast.yearly.length===0?<EmptyState title="Inga kostnader planerade" description="Lägg till en underhållsåtgärd för att bygga prognosen."/>:<div className="space-y-3">{data.forecast.yearly.map(item=><div key={item.year} className="grid grid-cols-[52px_1fr_auto] items-center gap-3"><span className="text-xs font-semibold text-ink-500">{item.year}</span><div className="h-3 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{width:`${Math.max(3,(item.amount/maxYear)*100)}%`}}/></div><span className="text-xs font-semibold text-ink-800">{money.format(item.amount)}</span></div>)}</div>}
        </Panel>
        <Panel title="Planstatus" description="Aktiv version och riskbild.">
          <dl className="space-y-4 text-sm"><Row label="Plan" value={`${data.activePlan.name} · v${data.activePlan.version}`}/><Row label="Tidshorisont" value={`${data.activePlan.horizon_years} år`}/><Row label="Åtgärder" value={String(data.actions.length)}/><Row label="Akuta/kritiska" value={String(data.forecast.urgent)}/><Row label="Försenade" value={String(data.forecast.overdue)}/></dl>
          {(data.forecast.urgent>0||data.forecast.overdue>0)?<div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0"/><p>{data.forecast.urgent} kritiska och {data.forecast.overdue} försenade åtgärder behöver följas upp.</p></div>:<div className="mt-5 flex gap-3 rounded-xl border border-petroleum-100 bg-petroleum-50 p-4 text-sm text-petroleum-900"><CheckCircle2 className="h-5 w-5 shrink-0"/><p>Planen saknar kritiska eller försenade åtgärder.</p></div>}
        </Panel>
      </div>
    </>:<EmptyState title="Ingen aktiv underhållsplan" description="Skapa en planversion och aktivera den för att börja prognostisera kostnader."/>}

    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <Panel title="Administrera plan" description="Skapa planversioner och registrera nya underhållsåtgärder.">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-sand-50 p-1"><button type="button" onClick={()=>setMode("action")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode==="action"?"bg-white text-petroleum-800 shadow-sm":"text-ink-500"}`}>Ny åtgärd</button><button type="button" onClick={()=>setMode("plan")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode==="plan"?"bg-white text-petroleum-800 shadow-sm":"text-ink-500"}`}>Ny planversion</button></div>
        <form onSubmit={submit} className="space-y-4">
          {mode==="plan"?<>
            <input type="hidden" name="action" value="plan.create"/><Field label="Planens namn"><input required name="name" className={premiumFieldClass} placeholder="Underhållsplan 2026–2055"/></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Basår"><input required name="baseYear" type="number" defaultValue={new Date().getFullYear()} className={premiumFieldClass}/></Field><Field label="Tidshorisont"><select name="horizonYears" defaultValue="30" className={premiumFieldClass}><option value="5">5 år</option><option value="10">10 år</option><option value="20">20 år</option><option value="30">30 år</option></select></Field></div>
            <Field label="Årlig indexering (%)"><input required name="annualIndexRate" type="number" step="0.1" min="0" max="25" defaultValue="2" className={premiumFieldClass}/></Field>
            <Field label="Sammanfattning"><textarea name="summary" rows={3} className={premiumFieldClass} placeholder="Planens syfte och omfattning"/></Field>
            <Field label="Antaganden"><textarea name="assumptions" rows={3} className={premiumFieldClass} placeholder="Prisnivå, index och tekniska antaganden"/></Field>
          </>:<>
            <input type="hidden" name="action" value="action.create"/><input type="hidden" name="planId" value={data.activePlan?.id||data.plans[0]?.id||""}/>
            {!data.activePlan&&data.plans.length>0?<InlineAlert tone="warning">Åtgärden läggs i senaste planutkastet. Aktivera planen när den är granskad.</InlineAlert>:null}
            <Field label="Åtgärd"><input required name="title" className={premiumFieldClass} placeholder="Ex. Omläggning av tak"/></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Kategori"><select name="category" className={premiumFieldClass}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Planerat år"><input required name="plannedYear" type="number" defaultValue={data.activePlan?.base_year||new Date().getFullYear()} className={premiumFieldClass}/></Field></div>
            <Field label="Kostnad exkl. moms"><input required name="estimatedCost" type="number" min="0" step="1000" className={premiumFieldClass} placeholder="0"/></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Prioritet"><select name="priority" defaultValue="normal" className={premiumFieldClass}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Akut</option></select></Field><Field label="Risk"><select name="risk" defaultValue="low" className={premiumFieldClass}><option value="low">Låg</option><option value="medium">Medel</option><option value="high">Hög</option><option value="critical">Kritisk</option></select></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Intervall (år)"><input name="recurrenceYears" type="number" min="1" className={premiumFieldClass}/></Field><Field label="Teknisk livslängd"><input name="technicalLifetimeYears" type="number" min="1" className={premiumFieldClass}/></Field></div>
            <Field label="Byggnad"><select name="buildingId" className={premiumFieldClass}><option value="">Hela fastigheten</option>{data.property.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Teknisk installation"><select name="technicalAssetId" className={premiumFieldClass}><option value="">Ingen särskild installation</option>{data.assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Omfattning"><textarea name="scope" rows={2} className={premiumFieldClass} placeholder="Mängd, yta eller byggnadsdel"/></Field>
            <Field label="Entreprenör"><input name="contractor" className={premiumFieldClass} placeholder="Valfri leverantör"/></Field>
          </>}
          <button disabled={saving||(!data.activePlan&&data.plans.length===0&&mode==="action")} className={`${premiumPrimaryButtonClass} w-full`}><Plus className="h-4 w-4"/>{saving?"Sparar…":mode==="plan"?"Skapa planversion":"Lägg till åtgärd"}</button>
        </form>
        {data.plans.length>0?<div className="mt-6 border-t border-sand-100 pt-5"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Planversioner</p><div className="space-y-2">{data.plans.map(plan=><div key={plan.id} className="flex items-center justify-between gap-3 rounded-xl bg-sand-50 p-3"><div><p className="text-sm font-semibold text-ink-800">{plan.name} · v{plan.version}</p><p className="text-xs text-ink-500">{plan.base_year} · {plan.horizon_years} år</p></div>{plan.status==="active"?<Badge value="active" type="status"/>:<button type="button" disabled={saving} onClick={()=>activate(plan.id)} className="text-xs font-semibold text-petroleum-700">Aktivera</button>}</div>)}</div></div>:null}
      </Panel>

      <Panel title="Planerade åtgärder" description="Prioriterad åtgärdslista för den valda planversionen." bodyClassName="p-0">
        {data.actions.length===0?<EmptyState title="Inga åtgärder registrerade" description="Lägg till den första åtgärden för att bygga underhållsplanen."/>:<div className="divide-y divide-sand-100">{data.actions.map(item=><article key={item.id} className="p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{item.title}</h3><Badge value={item.priority} type="priority"/><Badge value={item.risk} type="risk"/><Badge value={item.status} type="status"/></div><p className="mt-2 text-sm text-ink-500">{item.category}{item.building_name?` · ${item.building_name}`:""}{item.technical_asset_name?` · ${item.technical_asset_name}`:""}</p>{item.scope?<p className="mt-2 text-sm leading-6 text-ink-600">{item.scope}</p>:null}</div><div className="shrink-0 text-left sm:text-right"><p className="text-lg font-semibold text-ink-950">{money.format(item.estimated_cost)}</p><p className="mt-1 flex items-center gap-1 text-xs text-ink-500 sm:justify-end"><CalendarRange className="h-3.5 w-3.5"/>{item.planned_year}{item.recurrence_years?` · vart ${item.recurrence_years}:e år`:""}</p></div></div></article>)}</div>}
      </Panel>
    </div>
  </section>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>}
function Row({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between gap-4 border-b border-sand-100 pb-3"><dt className="text-ink-500">{label}</dt><dd className="font-semibold text-ink-900">{value}</dd></div>}
