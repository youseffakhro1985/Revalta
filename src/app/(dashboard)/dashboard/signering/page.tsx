"use client";

import { useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string };
type Signature = { id: string; property_name?: string; document_type?: string; title?: string; signer_name?: string; signer_email?: string; reference?: string; signed_at?: string; method?: string; verification_status?: string };

const typeLabels: Record<string, string> = { receipt: "Kvittens", work_order: "Arbetsorder", inspection: "Besiktning", quote: "Offert", handover: "Överlämning", other: "Övrigt" };
const methodLabels: Record<string, string> = { manual: "Manuell", email: "E-post", bankid: "BankID", in_person: "På plats" };
const inputClass = "h-11 w-full rounded-xl border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

export default function SigneringPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/signatures", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setProperties(data.properties || []); setSignatures(data.signatures || []); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(formData: FormData) {
    setSaving(true); setMessage("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/signatures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Något gick fel");
    else { setMessage("Signeringen har registrerats och verifierats."); await load(); }
    setSaving(false);
  }

  const stats = useMemo(() => ({
    total: signatures.length,
    bankid: signatures.filter((item) => item.method === "bankid").length,
    recent: signatures.filter((item) => item.signed_at && new Date(item.signed_at).getTime() > Date.now() - 30 * 86400000).length,
  }), [signatures]);

  return <div className="space-y-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-700">Godkännanden och kvittenser</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Digital signering</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samla signerade kvittenser, arbetsordrar, besiktningar, offerter och överlämningar med tydlig verifiering och historik.</p></div>

    <div className="grid gap-4 md:grid-cols-3">{[["Signerade underlag", stats.total], ["BankID-signeringar", stats.bankid], ["Senaste 30 dagarna", stats.recent]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><p className="text-xs font-medium text-ink-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p></div>)}</div>

    <form action={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
      <div className="mb-5"><h2 className="text-lg font-semibold text-ink-900">Registrera signerat underlag</h2><p className="mt-1 text-sm text-ink-500">Dokumentera vem som godkänt vad, när och med vilken metod.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={inputClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <select name="documentType" className={inputClass}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="title" required placeholder="Rubrik eller dokumentnamn" className={`${inputClass} md:col-span-2`} />
        <input name="signerName" required placeholder="Signatärens namn" className={inputClass} />
        <input name="signerEmail" type="email" placeholder="E-post" className={inputClass} />
        <input name="reference" placeholder="Referensnummer" className={inputClass} />
        <input name="signedAt" required type="datetime-local" className={inputClass} />
        <select name="method" className={inputClass}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="note" placeholder="Anteckning" className={`${inputClass} md:col-span-2 xl:col-span-2`} />
        <button disabled={saving} className="h-11 rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar..." : "Registrera signering"}</button>
      </div>
      {message ? <p className="mt-4 text-sm text-ink-600">{message}</p> : null}
    </form>

    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-6 py-4"><h2 className="font-semibold text-ink-900">Signeringshistorik</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-sand-50 text-xs uppercase tracking-[0.08em] text-ink-400"><tr>{["Fastighet", "Underlag", "Typ", "Signatär", "Metod", "Signerad", "Referens", "Status"].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr></thead><tbody className="divide-y divide-sand-100">{loading ? <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-400">Laddar...</td></tr> : signatures.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-400">Inga signeringar registrerade.</td></tr> : signatures.map((item) => <tr key={item.id} className="text-ink-700"><td className="px-5 py-4 font-medium text-ink-900">{item.property_name}</td><td className="px-5 py-4">{item.title}</td><td className="px-5 py-4">{typeLabels[item.document_type || ""] || item.document_type}</td><td className="px-5 py-4"><p>{item.signer_name}</p><p className="text-xs text-ink-400">{item.signer_email}</p></td><td className="px-5 py-4">{methodLabels[item.method || ""] || item.method}</td><td className="px-5 py-4">{item.signed_at ? new Date(item.signed_at).toLocaleString("sv-SE") : "–"}</td><td className="px-5 py-4">{item.reference || "–"}</td><td className="px-5 py-4"><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-xs font-semibold text-petroleum-700">Verifierad</span></td></tr>)}</tbody></table></div>
    </div>
  </div>;
}