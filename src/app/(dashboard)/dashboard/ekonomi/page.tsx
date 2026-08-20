"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Banknote, Building2, CalendarDays, CircleDollarSign, FileText, LineChart, Search } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

type BudgetEntry = { id:string; property_id?:string; property_name?:string; year?:number; category?:string; account?:string; budget?:number; actual?:number; created_at:string };
type RentNotice = { id:string; property_id?:string; property_name?:string; tenant_name?:string; period?:string; due_date?:string; status?:string; total?:number; created_at:string };
type RangeKey = "quarter" | "year" | "all";

const money = new Intl.NumberFormat("sv-SE", { style:"currency", currency:"SEK", maximumFractionDigits:0 });
const dateFmt = new Intl.DateTimeFormat("sv-SE", { day:"numeric", month:"short", year:"numeric" });
const statusText:Record<string,string> = { draft:"Utkast", sent:"Skickad", paid:"Betald", overdue:"Förfallen", credited:"Krediterad" };
const expense = new Set(["operations","maintenance","energy","administration","other"]);

function quarterStart(d=new Date()){ return new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1); }
function rangeStart(range:RangeKey){ const now=new Date(); return range==="quarter"?quarterStart(now):range==="year"?new Date(now.getFullYear(),0,1):new Date(2000,0,1); }
function inRange(value:string|undefined, range:RangeKey){ if(!value) return range==="all"; const t=new Date(value).getTime(); return Number.isFinite(t)&&t>=rangeStart(range).getTime()&&t<=Date.now()+86400000; }
function compact(value:number){ const a=Math.abs(value); if(a>=1_000_000)return `${(value/1_000_000).toLocaleString("sv-SE",{maximumFractionDigits:1})} Mkr`; if(a>=1_000)return `${(value/1_000).toLocaleString("sv-SE",{maximumFractionDigits:1})} tkr`; return money.format(value); }
function qKey(d:Date){ return `${d.getFullYear()}-${Math.floor(d.getMonth()/3)+1}`; }
function qLabel(d:Date){ return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`; }
function quarters(){ const q=quarterStart(); return Array.from({length:6},(_,i)=>new Date(q.getFullYear(),q.getMonth()-(5-i)*3,1)); }
function line(values:number[],max:number){ return values.map((v,i)=>`${i?"L":"M"}${24+(i/5)*672},${210-(Math.max(0,v)/Math.max(1,max))*190}`).join(" "); }

export default function EconomyPage(){
  const router=useRouter();
  const [entries,setEntries]=useState<BudgetEntry[]>([]);
  const [notices,setNotices]=useState<RentNotice[]>([]);
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [range,setRange]=useState<RangeKey>("quarter");

  useEffect(()=>{ let active=true; void(async()=>{ try{
    const [b,n]=await Promise.all([fetch("/api/budget",{cache:"no-store"}),fetch("/api/rent-notices",{cache:"no-store"})]);
    if(b.status===401||n.status===401){router.push("/login");return;}
    const bd=await readResponseJson<{entries?:BudgetEntry[];permissions?:{canManage?:boolean};error?:string}>(b);
    const nd=await readResponseJson<{notices?:RentNotice[]}>(n);
    if(!b.ok) throw new Error(bd.error||"Kunde inte hämta ekonomidata");
    if(active){setEntries(bd.entries||[]);setCanManage(Boolean(bd.permissions?.canManage));if(n.ok)setNotices(nd.notices||[]);}
  }catch(e){if(active)setError(e instanceof Error?e.message:"Kunde inte läsa ekonomin");}finally{if(active)setLoading(false);} })(); return()=>{active=false}; },[router]);

  const q=query.trim().toLocaleLowerCase("sv-SE");
  const currentYear=new Date().getFullYear();
  const ns=useMemo(()=>notices.filter(n=>inRange(n.due_date||n.created_at,range)).filter(n=>!q||[n.tenant_name,n.property_name,n.period,n.status].some(v=>String(v||"").toLocaleLowerCase("sv-SE").includes(q))),[notices,range,q]);
  const es=useMemo(()=>entries.filter(e=>range==="all"||Number(e.year||currentYear)===currentYear).filter(e=>!q||[e.account,e.property_name,e.category,e.year].some(v=>String(v||"").toLocaleLowerCase("sv-SE").includes(q))),[entries,range,q,currentYear]);

  const m=useMemo(()=>{
    const paid=ns.filter(n=>n.status==="paid").reduce((s,n)=>s+Number(n.total||0),0);
    const invoiced=ns.filter(n=>n.status!=="credited").reduce((s,n)=>s+Number(n.total||0),0);
    const registeredIncome=es.filter(e=>e.category==="income").reduce((s,e)=>s+Number(e.actual||0),0);
    const income=paid||registeredIncome||invoiced;
    const operations=es.filter(e=>expense.has(e.category||"")).reduce((s,e)=>s+Math.max(0,Number(e.actual||0)),0);
    const finance=es.filter(e=>e.category==="finance").reduce((s,e)=>s+Math.max(0,Number(e.actual||0)),0);
    const investments=es.filter(e=>e.category==="investment").reduce((s,e)=>s+Math.max(0,Number(e.actual||0)),0);
    const overdue=ns.filter(n=>n.status==="overdue"||(n.due_date&&new Date(n.due_date).getTime()<Date.now()&&!["paid","credited"].includes(n.status||""))).reduce((s,n)=>s+Number(n.total||0),0);
    const net=income-operations-finance; return {income,operations,finance,investments,overdue,net,cash:net-investments};
  },[ns,es]);

  const series=useMemo(()=>quarters().map(qtr=>{
    const income=notices.filter(n=>n.status==="paid"&&qKey(new Date(n.due_date||n.created_at))===qKey(qtr)).reduce((s,n)=>s+Number(n.total||0),0);
    const yearCosts=entries.filter(e=>Number(e.year||new Date(e.created_at).getFullYear())===qtr.getFullYear()&&e.category!=="income"&&e.category!=="investment").reduce((s,e)=>s+Math.max(0,Number(e.actual||0)),0)/4;
    const invest=entries.filter(e=>Number(e.year||new Date(e.created_at).getFullYear())===qtr.getFullYear()&&e.category==="investment").reduce((s,e)=>s+Math.max(0,Number(e.actual||0)),0)/4;
    return {label:qLabel(qtr),income,net:income-yearCosts,cash:income-yearCosts-invest};
  }),[entries,notices]);
  const chartMax=Math.max(1,...series.flatMap(v=>[v.income,Math.max(0,v.net),Math.max(0,v.cash)]));

  const budgetRows=useMemo(()=>{
    const calc=(label:string,cats:string[],sign=1)=>{const rows=es.filter(e=>cats.includes(e.category||""));const budget=rows.reduce((s,e)=>s+Number(e.budget||0)*sign,0);const actual=rows.reduce((s,e)=>s+Number(e.actual||0)*sign,0);return{label,budget,actual,variance:budget?((actual-budget)/Math.abs(budget))*100:null};};
    const income=calc("Hyresintäkter",["income"]); if(!income.actual) income.actual=m.income;
    const ops=calc("Driftkostnader",["operations","maintenance","energy","administration","other"],-1);
    const interest=calc("Räntenetto",["finance"],-1);
    const invest=calc("Investeringar",["investment"],-1);
    const netBudget=income.budget+ops.budget+interest.budget; const cashBudget=netBudget+invest.budget;
    return [income,{label:"Driftnetto",budget:netBudget,actual:m.net,variance:netBudget?((m.net-netBudget)/Math.abs(netBudget))*100:null},ops,interest,{label:"Kassaflöde",budget:cashBudget,actual:m.cash,variance:cashBudget?((m.cash-cashBudget)/Math.abs(cashBudget))*100:null}];
  },[es,m]);

  const recent=useMemo(()=>[...ns].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,5),[ns]);
  const upcoming=useMemo(()=>ns.filter(n=>n.due_date&&new Date(n.due_date).getTime()>=new Date().setHours(0,0,0,0)&&!["paid","credited"].includes(n.status||"")).sort((a,b)=>new Date(a.due_date||0).getTime()-new Date(b.due_date||0).getTime()).slice(0,4),[ns]);
  const distribution=useMemo(()=>{const map=new Map<string,{id?:string;name:string;amount:number}>();ns.filter(n=>n.status!=="credited").forEach(n=>{const name=n.property_name||"Ej kopplad";const row=map.get(name)||{id:n.property_id,name,amount:0};row.amount+=Number(n.total||0);map.set(name,row);});return[...map.values()].sort((a,b)=>b.amount-a.amount).slice(0,6);},[ns]);
  const distTotal=distribution.reduce((s,v)=>s+v.amount,0);

  return <div className="space-y-4 sm:space-y-5">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Ekonomi & analys / Översikt</p><h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Ekonomi</h1><p className="mt-1 text-sm text-ink-500">Hyresintäkter, budget, utfall och betalningsläge i en samlad ekonomisk arbetsyta.</p></div><div className="flex gap-2"><select value={range} onChange={e=>setRange(e.target.value as RangeKey)} aria-label="Period" className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-650"><option value="quarter">Senaste kvartalet</option><option value="year">Detta år</option><option value="all">Alla perioder</option></select>{canManage?<Link href="/dashboard/ekonomi/ny-utbetalning" className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[11px] font-semibold text-white"><CircleDollarSign className="h-4 w-4"/>Ny utbetalning</Link>:null}</div></div>
    <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm"><label className="relative block max-w-2xl"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Sök i ekonomin" placeholder="Sök fakturor, hyresgäster, konton, budget ..." className="h-11 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] pl-10 pr-4 text-[12px] outline-none focus:ring-2 focus:ring-petroleum-100"/></label></section>
    {error?<div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi icon={CircleDollarSign} label="Hyresintäkter" value={loading?"—":compact(m.income)} helper={`${ns.length} avier i vald period`} href="/dashboard/hyresavisering"/><Kpi icon={LineChart} label="Driftnetto" value={loading?"—":compact(m.net)} helper={`${compact(m.operations+m.finance)} kostnader`} href="/dashboard/budget" negative={m.net<0}/><Kpi icon={FileText} label="Förfallna fakturor" value={loading?"—":compact(m.overdue)} helper="Förfallna avier" href="/dashboard/hyresavisering" negative={m.overdue>0}/><Kpi icon={Banknote} label="Kassaflöde" value={loading?"—":compact(m.cash)} helper={`${compact(m.investments)} investeringar`} href="/dashboard/rapporter" negative={m.cash<0}/></section>
    <section className="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]"><article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><h2 className="font-display text-[18px] font-semibold text-ink-950">Ekonomisk utveckling</h2><div className="mt-3 flex gap-4 text-[10px] text-ink-500"><Legend cls="bg-petroleum-800" text="Hyresintäkter"/><Legend cls="bg-petroleum-400" text="Driftnetto"/><Legend cls="bg-sand-500" text="Kassaflöde"/></div>{series.every(v=>!v.income&&!v.net&&!v.cash)?<Empty icon={LineChart} title="Ingen ekonomisk historik ännu"/>:<div className="mt-5 rounded-xl bg-[#FCFBF8] px-3 py-4"><svg viewBox="0 0 720 240" className="h-[230px] w-full" role="img" aria-label="Ekonomisk utveckling">{[0,1,2,3,4].map(i=><line key={i} x1="24" y1={20+i*48} x2="696" y2={20+i*48} stroke="#ece4d8"/>)}<path d={line(series.map(v=>v.income),chartMax)} fill="none" stroke="#29463f" strokeWidth="3"/><path d={line(series.map(v=>Math.max(0,v.net)),chartMax)} fill="none" stroke="#779e90" strokeWidth="2.5"/><path d={line(series.map(v=>Math.max(0,v.cash)),chartMax)} fill="none" stroke="#ad9f89" strokeWidth="2.25"/></svg><div className="grid grid-cols-6 text-center text-[9px] text-ink-400">{series.map(v=><span key={v.label}>{v.label}</span>)}</div></div>}</article><article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex justify-between"><h2 className="font-display text-[18px] font-semibold text-ink-950">Budget vs utfall</h2><Link href="/dashboard/budget" className="text-[10px] font-semibold text-petroleum-700">Öppna budget</Link></div><div className="mt-5 divide-y divide-sand-100">{budgetRows.map(r=><BudgetRow key={r.label}{...r}/>)}</div></article></section>
    <section className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr_0.8fr]"><article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm"><Head title="Senaste fakturor" href="/dashboard/hyresavisering"/>{recent.length?<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="bg-[#FCFBF8] text-[9px] text-ink-400"><th className="px-4 py-2.5">Fakturanr</th><th className="px-3">Motpart</th><th className="px-3">Fastighet</th><th className="px-3">Förfallodatum</th><th className="px-3 text-right">Belopp</th><th className="px-4">Status</th></tr></thead><tbody className="divide-y divide-sand-100">{recent.map(n=><tr key={n.id} onClick={()=>router.push("/dashboard/hyresavisering")} className="cursor-pointer text-[10px] text-ink-600 hover:bg-sand-50"><td className="px-4 py-3 font-medium">F-{n.period?.slice(0,4)||currentYear}-{n.id.slice(0,6).toUpperCase()}</td><td className="px-3">{n.tenant_name||"Ej angiven"}</td><td className="px-3">{n.property_name||"—"}</td><td className="px-3">{n.due_date?dateFmt.format(new Date(n.due_date)):"—"}</td><td className="px-3 text-right font-semibold">{money.format(Number(n.total||0))}</td><td className="px-4"><Status status={n.status||"draft"}/></td></tr>)}</tbody></table></div>:<Empty icon={FileText} title="Inga fakturor ännu"/>}</article><article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><h2 className="font-display text-[17px] font-semibold">Fördelning per fastighet</h2>{distribution.length?<><div className="mx-auto mt-5 h-36 w-36 rounded-full" style={{background:donut(distribution)}}><div className="relative left-[26px] top-[26px] flex h-[92px] w-[92px] items-center justify-center rounded-full bg-white text-center text-[10px] font-semibold">{compact(distTotal)}<br/>Hyresintäkter</div></div><div className="mt-4 space-y-2">{distribution.map((v,i)=><Link key={v.name} href={v.id?`/dashboard/fastigheter/${v.id}`:"/dashboard/fastigheter"} className="flex items-center gap-2 text-[10px] text-ink-600"><span className={`h-2 w-2 rounded-full ${dot(i)}`}/><span className="flex-1 truncate">{v.name}</span><strong>{distTotal?((v.amount/distTotal)*100).toLocaleString("sv-SE",{maximumFractionDigits:1}):0}%</strong></Link>)}</div></>:<Empty icon={Building2} title="Ingen fördelning ännu"/>}</article><article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><Head title="Kommande betalningar" href="/dashboard/hyresavisering" compact/>{upcoming.length?<div className="mt-3 divide-y divide-sand-100">{upcoming.map(n=><Link key={n.id} href="/dashboard/hyresavisering" className="flex items-start gap-2 py-3 text-[10px]"><CalendarDays className="mt-0.5 h-4 w-4 text-petroleum-700"/><span className="min-w-0 flex-1"><strong className="block truncate">{n.tenant_name||"Betalning"}</strong><span className="block truncate text-[9px] text-ink-400">{n.property_name||"Fastighet"} · {n.due_date?dateFmt.format(new Date(n.due_date)):"—"}</span></span><strong>{money.format(Number(n.total||0))}</strong></Link>)}</div>:<Empty icon={CalendarDays} title="Inga kommande betalningar"/>}</article></section>
  </div>;
}

function Kpi({icon:Icon,label,value,helper,href,negative=false}:{icon:LucideIcon;label:string;value:string;helper:string;href:string;negative?:boolean}){return <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-sand-50 text-petroleum-800"><Icon className="h-[18px] w-[18px]"/></span><div><p className="text-[11px] text-ink-650">{label}</p><p className="mt-1 font-display text-[27px] font-semibold text-ink-950">{value}</p><p className={`mt-1 text-[9px] ${negative?"text-danger-600":"text-petroleum-600"}`}>{helper}</p></div></div><Link href={href} className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa detaljer <ArrowRight className="h-3 w-3"/></Link></article>}
function BudgetRow({label,actual,budget,variance}:{label:string;actual:number;budget:number;variance:number|null}){const ratio=budget?Math.min(100,Math.abs(actual/budget)*100):actual?100:0;return <div className="grid grid-cols-[1fr_68px_68px_50px] items-center gap-2 py-3 text-[10px]"><div><p className="font-medium">{label}</p><div className="mt-1 h-1.5 rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-700" style={{width:`${ratio}%`}}/></div></div><span className="text-right">{compact(actual)}</span><span className="text-right text-ink-500">{compact(budget)}</span><span className={`text-right font-semibold ${(variance??0)<0?"text-danger-600":"text-petroleum-600"}`}>{variance===null?"—":`${variance>0?"+":""}${variance.toLocaleString("sv-SE",{maximumFractionDigits:1})}%`}</span></div>}
function Legend({cls,text}:{cls:string;text:string}){return <span className="inline-flex items-center gap-1.5"><span className={`h-0.5 w-5 ${cls}`}/>{text}</span>}
function Empty({icon:Icon,title}:{icon:LucideIcon;title:string}){return <div className="py-10 text-center"><Icon className="mx-auto h-7 w-7 text-sand-400"/><p className="mt-2 text-[11px] font-semibold text-ink-700">{title}</p></div>}
function Head({title,href,compact=false}:{title:string;href:string;compact?:boolean}){return <div className={`flex items-center justify-between ${compact?"":"border-b border-sand-100 px-5 py-4"}`}><h2 className="font-display text-[17px] font-semibold">{title}</h2><Link href={href} className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3"/></Link></div>}
function Status({status}:{status:string}){const cls=status==="paid"?"border-success-200 bg-success-50 text-success-700":status==="overdue"?"border-danger-200 bg-danger-50 text-danger-700":"border-sand-200 bg-sand-50 text-ink-550";return <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${cls}`}>{statusText[status]||status}</span>}
function donut(items:Array<{amount:number}>){const colors=["#29463f","#587f73","#779e90","#a5c2b7","#ad9f89","#ded3c2"];const total=items.reduce((s,v)=>s+v.amount,0)||1;let p=0;return `conic-gradient(${items.map((v,i)=>{const a=p;p+=(v.amount/total)*100;return `${colors[i%colors.length]} ${a}% ${p}%`}).join(",")})`}
function dot(i:number){return ["bg-petroleum-800","bg-petroleum-500","bg-petroleum-400","bg-petroleum-300","bg-sand-500","bg-sand-300"][i%6]||"bg-sand-400"}
