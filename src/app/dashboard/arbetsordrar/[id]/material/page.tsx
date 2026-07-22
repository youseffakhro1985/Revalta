"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Boxes, CheckCircle2, CircleDollarSign, PackageCheck, RefreshCw, Save, Trash2 } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Material={entryId:string;articleNumber?:string|null;name:string;quantity:number;unit:string;unitPrice:number;total:number;supplier?:string|null;stockStatus:string;billable:boolean;note?:string|null;status:string;createdById:string;createdByName?:string|null;createdByEmail:string;createdAt:string};
type Data={materials:Material[];summary:{total:number;billable:number;pending:number;ordered:number};canManage:boolean;currentUserId:string};
const input="w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-petroleum-500";
const money=new Intl.NumberFormat("sv-SE",{style:"currency",currency:"SEK"});
const dt=new Intl.DateTimeFormat("sv-SE",{dateStyle:"medium",timeStyle:"short"});
const stockLabels:Record<string,string>={in_stock:"I lager",ordered:"Beställd",used:"Förbrukad",returned:"Returnerad"};

export default function WorkOrderMaterialsPage({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [form,setForm]=useState({articleNumber:"",name:"",quantity:"1",unit:"st",unitPrice:"0",supplier:"",stockStatus:"used",billable:true,note:""});

  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch(`/api/work-orders/${id}/materials`,{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error||"Kunde inte hämta material");setData(b);}catch(e){setError(e instanceof Error?e.message:"Kunde inte hämta material");}finally{setLoading(false);}},[id]);
  useEffect(()=>{void load();},[load]);
  async function action(payload:Record<string,unknown>){setSaving(true);setError("");setMessage("");try{const r=await fetch(`/api/work-orders/${id}/materials`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const b=await r.json();if(!r.ok)throw new Error(b.error||"Åtgärden misslyckades");setMessage("Materialregistreringen har uppdaterats.");if(payload.action==="create")setForm({articleNumber:"",name:"",quantity:"1",unit:"st",unitPrice:"0",supplier:"",stockStatus:"used",billable:true,note:""});await load();}catch(e){setError(e instanceof Error?e.message:"Åtgärden misslyckades");}finally{setSaving(false);}}
  const rows=data?.materials??[];
  const preview=useMemo(()=>Math.max(0,Number(form.quantity)||0)*Math.max(0,Number(form.unitPrice)||0),[form.quantity,form.unitPrice]);
  const summary=data?.summary??{total:0,billable:0,pending:0,ordered:0};

  return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
    <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
      <Link href={`/dashboard/arbetsordrar/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700"><ArrowLeft className="h-4 w-4"/>Till arbetsordern</Link>
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-petroleum-600">Arbetsorder</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Material och kostnader</h1><p className="mt-2 text-ink-600">Registrera material, leverantör, lagerstatus och debiterbar kostnad.</p></div><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Uppdatera</button></div>
    </header>
    {error?<InlineAlert>{error}</InlineAlert>:null}{message?<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{message}</div>:null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={CircleDollarSign} label="Materialkostnad" value={money.format(summary.total)}/><MetricCard icon={CheckCircle2} label="Debiterbart" value={money.format(summary.billable)}/><MetricCard icon={Boxes} label="Väntar attest" value={summary.pending}/><MetricCard icon={PackageCheck} label="Beställda rader" value={summary.ordered}/></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,.8fr)]">
      <Panel title="Materialrader" description="Alla registrerade materialkostnader för arbetsordern.">
        {loading&&!data?<div className="h-52 animate-pulse rounded-xl bg-sand-100"/>:null}
        {!loading&&!rows.length?<EmptyState title="Inget material registrerat" description="Lägg till den första materialraden från formuläret."/>:null}
        <div className="space-y-3">{rows.map(row=><div key={row.entryId} className="rounded-xl border border-sand-200 p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{row.name}</p>{row.articleNumber?<span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs text-ink-600">{row.articleNumber}</span>:null}<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status==="approved"?"bg-emerald-50 text-emerald-800":row.status==="rejected"?"bg-red-50 text-red-700":"bg-amber-50 text-amber-800"}`}>{row.status==="approved"?"Attesterad":row.status==="rejected"?"Avvisad":"Väntar attest"}</span>{row.billable?<span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-xs font-semibold text-petroleum-800">Debiterbar</span>:null}</div><p className="mt-1 text-sm text-ink-600">{row.quantity} {row.unit} × {money.format(row.unitPrice)} · {stockLabels[row.stockStatus]||row.stockStatus}</p><p className="mt-1 text-xs text-ink-500">{row.supplier?`${row.supplier} · `:""}{row.createdByName||row.createdByEmail} · {dt.format(new Date(row.createdAt))}</p>{row.note?<p className="mt-2 text-sm text-ink-700">{row.note}</p>:null}</div><div className="flex items-start gap-2"><p className="min-w-28 text-right text-lg font-semibold text-ink-950">{money.format(row.total)}</p>{data?.canManage&&row.status==="submitted"?<><button onClick={()=>void action({action:"approve",entryId:row.entryId})} disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Attestera</button><button onClick={()=>void action({action:"reject",entryId:row.entryId})} disabled={saving} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Avvisa</button></>:null}{(data?.canManage||data?.currentUserId===row.createdById)?<button onClick={()=>void action({action:"delete",entryId:row.entryId})} disabled={saving} className="rounded-lg border border-sand-200 p-2 text-ink-500" aria-label="Ta bort materialrad"><Trash2 className="h-4 w-4"/></button>:null}</div></div></div>)}</div>
      </Panel>
      <Panel title="Lägg till material" description="Totalsumman räknas och valideras på servern.">
        <div className="grid gap-3"><input className={input} placeholder="Artikelnummer" value={form.articleNumber} onChange={e=>setForm({...form,articleNumber:e.target.value})}/><input className={input} placeholder="Materialnamn *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><div className="grid grid-cols-2 gap-3"><input type="number" min="0.01" step="0.01" className={input} placeholder="Antal" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/><select className={input} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>{["st","m","m2","m3","kg","l","förp"].map(x=><option key={x} value={x}>{x}</option>)}</select></div><input type="number" min="0" step="0.01" className={input} placeholder="Styckpris exkl. moms" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})}/><input className={input} placeholder="Leverantör" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/><select className={input} value={form.stockStatus} onChange={e=>setForm({...form,stockStatus:e.target.value})}>{Object.entries(stockLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><textarea className={`${input} min-h-24`} placeholder="Kommentar" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/><label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={form.billable} onChange={e=>setForm({...form,billable:e.target.checked})}/>Debiterbar materialkostnad</label><div className="rounded-xl bg-sand-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Beräknad totalsumma</p><p className="mt-1 text-2xl font-semibold text-ink-950">{money.format(preview)}</p></div><button onClick={()=>void action({action:"create",...form})} disabled={saving||!form.name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving?"Sparar…":"Spara materialrad"}</button></div>
      </Panel>
    </div>
  </div>;
}
