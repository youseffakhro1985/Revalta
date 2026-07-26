"use client";
import { readResponseJson } from "@/lib/fetch-json";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Banknote, Clock3, Package, Percent, ReceiptText } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Props = { workOrderId: string };

type TimeEntry = {
  entryId: string;
  kind: string;
  minutes: number | null;
  billable: boolean;
  status: string;
  note: string | null;
  startedAt: string | null;
  endedAt: string | null;
  userName: string | null;
  userEmail: string;
  source?: "table" | "legacy";
};

type MaterialEntry = {
  entryId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  billable: boolean;
  status: string;
  stockStatus: string;
  supplier: string | null;
  source?: "table" | "legacy";
};

type ProfitSummary = {
  approvedMinutes: number;
  billableMinutes: number;
  laborCost: number;
  laborRevenue: number;
  materialCost: number;
  materialRevenue: number;
  totalCost: number;
  totalRevenue: number;
  margin: number;
  marginPercent: number;
};

type ProfitSettings = {
  internalHourlyCost: number;
  customerHourlyRate: number;
  materialMarkupPercent: number;
  otherCost: number;
  fixedRevenue: number;
  source?: "table" | "legacy";
};

type InvoiceLine = {
  id: string;
  type: "labor" | "material" | "other";
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

type InvoiceDraft = {
  status: string;
  customerName: string;
  customerOrgNumber: string;
  customerReference: string;
  invoiceDate: string;
  dueDays: number;
  discountPercent: number;
  vatPercent: number;
  note: string;
  lines: InvoiceLine[];
  subtotal?: number;
  discount?: number;
  net?: number;
  vat?: number;
  total?: number;
  versionId?: string;
  source?: "table" | "legacy";
};

type IntegrationProvider = { id: string; name: string; configured: boolean };
type IntegrationJob = {
  jobId: string;
  provider: string;
  status: string;
  attempt?: number;
  error?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  source?: "table" | "legacy";
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const kindLabels: Record<string, string> = { work: "Arbete", travel: "Resa", break: "Rast" };
const statusLabels: Record<string, string> = {
  running: "Pågår",
  submitted: "Inskickad",
  approved: "Godkänd",
  rejected: "Avvisad",
  draft: "Utkast",
  ready: "Klar",
  exported: "Exporterad",
  cancelled: "Makulerad",
  queued: "I kö",
  processing: "Bearbetas",
  sent: "Skickad",
  failed: "Misslyckad",
};
const providerLabels: Record<string, string> = { fortnox: "Fortnox", visma: "Visma", webhook: "Webhook" };

export function WorkOrderEconomicsPanel({ workOrderId }: Props) {
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [profit, setProfit] = useState<ProfitSummary | null>(null);
  const [settings, setSettings] = useState<ProfitSettings>({
    internalHourlyCost: 350,
    customerHourlyRate: 650,
    materialMarkupPercent: 15,
    otherCost: 0,
    fixedRevenue: 0,
  });
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [exportJobs, setExportJobs] = useState<IntegrationJob[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("fortnox");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [timeRes, materialRes, profitRes, invoiceRes, integrationRes] = await Promise.all([
        fetch(`/api/work-orders/${workOrderId}/time-entries`, { cache: "no-store" }),
        fetch(`/api/work-orders/${workOrderId}/materials`, { cache: "no-store" }),
        fetch(`/api/work-orders/${workOrderId}/profitability`, { cache: "no-store" }),
        fetch(`/api/work-orders/${workOrderId}/invoice-basis`, { cache: "no-store" }),
        fetch(`/api/work-orders/${workOrderId}/invoice-integration`, { cache: "no-store" }),
      ]);
      const [timeData, materialData, profitData, invoiceData, integrationData] = await Promise.all([
        readResponseJson(timeRes),
        readResponseJson(materialRes),
        readResponseJson(profitRes),
        readResponseJson(invoiceRes),
        readResponseJson(integrationRes),
      ]);
      if (!timeRes.ok) throw new Error(timeData.error || "Kunde inte hämta tid");
      if (!materialRes.ok) throw new Error(materialData.error || "Kunde inte hämta material");
      if (!profitRes.ok) throw new Error(profitData.error || "Kunde inte hämta lönsamhet");
      if (!invoiceRes.ok) throw new Error(invoiceData.error || "Kunde inte hämta fakturaunderlag");
      if (!integrationRes.ok) throw new Error(integrationData.error || "Kunde inte hämta fakturaexport");

      setTimes((timeData.entries || []).map((entry: Record<string, unknown>) => ({
        entryId: String(entry.entryId || entry.id || ""),
        kind: String(entry.kind || "work"),
        minutes: typeof entry.minutes === "number" ? entry.minutes : null,
        billable: entry.billable !== false,
        status: String(entry.status || "submitted"),
        note: typeof entry.note === "string" ? entry.note : null,
        startedAt: typeof entry.startedAt === "string" ? entry.startedAt : null,
        endedAt: typeof entry.endedAt === "string" ? entry.endedAt : null,
        userName: typeof entry.userName === "string" ? entry.userName : null,
        userEmail: String(entry.userEmail || ""),
        source: entry.source === "legacy" || entry.source === "table" ? entry.source : undefined,
      })).filter((entry: TimeEntry) => entry.entryId));
      setMaterials((materialData.materials || []).map((entry: Record<string, unknown>) => ({
        entryId: String(entry.entryId || entry.id || ""),
        name: String(entry.name || ""),
        quantity: Number(entry.quantity || 0),
        unit: String(entry.unit || "st"),
        unitPrice: Number(entry.unitPrice || 0),
        total: Number(entry.total || 0),
        billable: entry.billable !== false,
        status: String(entry.status || "submitted"),
        stockStatus: String(entry.stockStatus || "used"),
        supplier: typeof entry.supplier === "string" ? entry.supplier : null,
        source: entry.source === "legacy" || entry.source === "table" ? entry.source : undefined,
      })).filter((entry: MaterialEntry) => entry.entryId));
      setProfit(profitData.summary || null);
      setSettings({
        ...(profitData.settings || {
          internalHourlyCost: 350,
          customerHourlyRate: 650,
          materialMarkupPercent: 15,
          otherCost: 0,
          fixedRevenue: 0,
        }),
        source: profitData.settings?.source === "legacy" || profitData.settings?.source === "table"
          ? profitData.settings.source
          : undefined,
      });
      setDraft({
        status: invoiceData.draft?.status || "draft",
        customerName: invoiceData.draft?.customerName || "",
        customerOrgNumber: invoiceData.draft?.customerOrgNumber || "",
        customerReference: invoiceData.draft?.customerReference || "",
        invoiceDate: invoiceData.draft?.invoiceDate || new Date().toISOString().slice(0, 10),
        dueDays: invoiceData.draft?.dueDays ?? 30,
        discountPercent: invoiceData.draft?.discountPercent ?? 0,
        vatPercent: invoiceData.draft?.vatPercent ?? 25,
        note: invoiceData.draft?.note || "",
        lines: Array.isArray(invoiceData.draft?.lines) ? invoiceData.draft.lines : [],
        subtotal: invoiceData.draft?.subtotal,
        discount: invoiceData.draft?.discount,
        net: invoiceData.draft?.net,
        vat: invoiceData.draft?.vat,
        total: invoiceData.draft?.total,
        versionId: invoiceData.draft?.versionId,
        source: invoiceData.draft?.source === "legacy" || invoiceData.draft?.source === "table"
          ? invoiceData.draft.source
          : undefined,
      });
      setProviders(integrationData.providers || []);
      setExportJobs((integrationData.jobs || []).map((job: Record<string, unknown>) => ({
        jobId: String(job.jobId || job.id || ""),
        provider: String(job.provider || ""),
        status: String(job.status || ""),
        attempt: typeof job.attempt === "number" ? job.attempt : undefined,
        error: typeof job.error === "string" ? job.error : null,
        updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : null,
        createdAt: typeof job.createdAt === "string" ? job.createdAt : null,
        source: job.source === "legacy" || job.source === "table" ? job.source : undefined,
      })));
      const configured = (integrationData.providers || []).find((provider: IntegrationProvider) => provider.configured);
      if (configured?.id) setSelectedProvider(configured.id);
      setCanManage(Boolean(timeData.canManage || materialData.canManage || profitData.canManage || invoiceData.canManage || integrationData.canManage));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta ekonomi");
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);

  async function post(url: string, body: Record<string, unknown>, message: string) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara");
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post(`/api/work-orders/${workOrderId}/profitability`, {
      internalHourlyCost: Number(form.get("internalHourlyCost")),
      customerHourlyRate: Number(form.get("customerHourlyRate")),
      materialMarkupPercent: Number(form.get("materialMarkupPercent")),
      otherCost: Number(form.get("otherCost")),
      fixedRevenue: Number(form.get("fixedRevenue")),
    }, "Lönsamhetsinställningarna har sparats.");
  }

  async function saveInvoice(status: string) {
    if (!draft) return;
    await post(`/api/work-orders/${workOrderId}/invoice-basis`, {
      ...draft,
      status,
      lines: draft.lines,
    }, status === "ready" ? "Fakturaunderlaget är klart." : "Fakturaunderlaget har sparats.");
  }

  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar arbetsorderekonomi" />;

  return (
    <div className="space-y-6" aria-busy={saving}>
      <div aria-live="polite" aria-atomic="true">
        {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ekonomisk översikt">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-500">Attesterad tid</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">{Math.round((profit?.approvedMinutes || 0) / 60 * 10) / 10} h</p>
              <p className="mt-1 text-xs text-ink-400">{profit?.billableMinutes || 0} min debiterbara</p>
            </div>
            <Clock3 className="h-5 w-5 text-petroleum-700" />
          </div>
        </article>
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-500">Kostnad</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(profit?.totalCost || 0)}</p>
            </div>
            <Banknote className="h-5 w-5 text-petroleum-700" />
          </div>
        </article>
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-500">Intäkt</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(profit?.totalRevenue || 0)}</p>
            </div>
            <ReceiptText className="h-5 w-5 text-petroleum-700" />
          </div>
        </article>
        <article className="rounded-2xl border border-sand-200 bg-sand-50 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-ink-500">Marginal</p>
              <p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(profit?.margin || 0)}</p>
              <p className="mt-1 text-xs text-ink-400">{profit?.marginPercent ?? 0}%</p>
            </div>
            <Percent className="h-5 w-5 text-petroleum-700" />
          </div>
        </article>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Attesterbar tid" description="Tid som ska godkännas innan den ingår i lönsamhet och faktura.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void post(`/api/work-orders/${workOrderId}/time-entries`, {
                action: "manual",
                kind: data.get("kind"),
                startedAt: data.get("startedAt"),
                endedAt: data.get("endedAt"),
                billable: data.get("billable") === "on",
                note: data.get("note"),
              }, "Tidsraden har registrerats.").then(() => form.reset());
            }}
            className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50/70 p-4"
          >
            <select name="kind" defaultValue="work" className={premiumFieldClass} aria-label="Tidstyp">
              <option value="work">Arbete</option>
              <option value="travel">Resa</option>
              <option value="break">Rast</option>
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="startedAt" type="datetime-local" required className={premiumFieldClass} aria-label="Starttid" />
              <input name="endedAt" type="datetime-local" required className={premiumFieldClass} aria-label="Sluttid" />
            </div>
            <input name="note" placeholder="Anteckning" className={premiumFieldClass} />
            <label className="inline-flex items-center gap-2 text-sm text-ink-600">
              <input name="billable" type="checkbox" defaultChecked className="h-4 w-4 rounded border-sand-300" />
              Debiterbar
            </label>
            <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Lägg till tid"}</button>
          </form>
          {times.some((entry) => entry.source === "legacy") ? (
            <p className="mt-4 text-xs font-medium text-amber-800">Äldre tidrader – kör backfill till WorkOrderTimeEntry innan attestering.</p>
          ) : null}
          <div className="mt-4 space-y-3">
            {times.length === 0 ? (
              <EmptyState title="Ingen attesterbar tid" description="Registrera tid här för att bygga fakturaunderlag." />
            ) : times.map((entry) => (
              <article key={entry.entryId} className="rounded-xl border border-sand-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">
                    {kindLabels[entry.kind] || entry.kind} · {entry.minutes ?? 0} min
                  </p>
                  <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    {statusLabels[entry.status] || entry.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {entry.userName || entry.userEmail}
                  {entry.startedAt ? ` · ${dateTime.format(new Date(entry.startedAt))}` : ""}
                  {entry.billable ? " · Debiterbar" : " · Ej debiterbar"}
                </p>
                {entry.source === "legacy" ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-800">Äldre rad – kan inte attesteras innan backfill.</p>
                ) : null}
                {canManage && entry.status === "submitted" && entry.source !== "legacy" ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/time-entries`, { action: "approve", entryId: entry.entryId }, "Tiden har godkänts.")}
                      className="rounded-lg border border-petroleum-200 bg-petroleum-50 px-3 py-1.5 text-xs font-semibold text-petroleum-900"
                    >
                      Godkänn
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/time-entries`, { action: "reject", entryId: entry.entryId }, "Tiden har avvisats.")}
                      className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-semibold text-ink-700"
                    >
                      Avvisa
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Material" description="Materialrader som ingår i kostnad, lönsamhet och faktura.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void post(`/api/work-orders/${workOrderId}/materials`, {
                action: "create",
                name: data.get("name"),
                quantity: data.get("quantity"),
                unit: data.get("unit"),
                unitPrice: data.get("unitPrice"),
                supplier: data.get("supplier"),
                billable: data.get("billable") === "on",
              }, "Materialraden har registrerats.").then(() => form.reset());
            }}
            className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50/70 p-4"
          >
            <input name="name" required placeholder="Artikel / material" className={premiumFieldClass} />
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required className={premiumFieldClass} aria-label="Antal" />
              <select name="unit" defaultValue="st" className={premiumFieldClass} aria-label="Enhet">
                {["st", "m", "m2", "m3", "kg", "l", "förp"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
              <input name="unitPrice" type="number" min="0" step="0.01" required placeholder="À-pris" className={premiumFieldClass} />
            </div>
            <input name="supplier" placeholder="Leverantör" className={premiumFieldClass} />
            <label className="inline-flex items-center gap-2 text-sm text-ink-600">
              <input name="billable" type="checkbox" defaultChecked className="h-4 w-4 rounded border-sand-300" />
              Debiterbar
            </label>
            <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Lägg till material"}</button>
          </form>
          {materials.some((entry) => entry.source === "legacy") ? (
            <p className="mt-4 text-xs font-medium text-amber-800">Äldre materialrader – kör backfill till WorkOrderMaterialEntry innan attestering.</p>
          ) : null}
          <div className="mt-4 space-y-3">
            {materials.length === 0 ? (
              <EmptyState title="Inget material" description="Lägg till material för att spegla verklig kostnad." />
            ) : materials.map((entry) => (
              <article key={entry.entryId} className="rounded-xl border border-sand-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-petroleum-700" />
                    <p className="font-semibold text-ink-900">{entry.name}</p>
                  </div>
                  <p className="text-sm font-semibold text-petroleum-800">{money.format(entry.total)}</p>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {entry.quantity} {entry.unit} · {money.format(entry.unitPrice)}/{entry.unit}
                  {entry.supplier ? ` · ${entry.supplier}` : ""}
                  {entry.billable ? " · Debiterbar" : " · Ej debiterbar"}
                </p>
                {entry.source === "legacy" ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-800">Äldre rad – kan inte attesteras innan backfill.</p>
                ) : null}
                {canManage && entry.status === "submitted" && entry.source !== "legacy" ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/materials`, { action: "approve", entryId: entry.entryId }, "Materialet har godkänts.")}
                      className="rounded-lg border border-petroleum-200 bg-petroleum-50 px-3 py-1.5 text-xs font-semibold text-petroleum-900"
                    >
                      Godkänn
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/materials`, { action: "reject", entryId: entry.entryId }, "Materialet har avvisats.")}
                      className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-semibold text-ink-700"
                    >
                      Avvisa
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Lönsamhet" description="Intern kostnad och kundpris för attesterad tid och material.">
        {settings.source === "legacy" ? (
          <p className="mb-4 text-xs font-medium text-amber-800">Äldre lönsamhetsinställningar – kör backfill innan de kan sparas om.</p>
        ) : null}
        <form onSubmit={saveProfit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Intern timkostnad</span>
            <input name="internalHourlyCost" type="number" min="0" step="0.01" defaultValue={settings.internalHourlyCost} disabled={!canManage || settings.source === "legacy"} className={premiumFieldClass} />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Kundtimpris</span>
            <input name="customerHourlyRate" type="number" min="0" step="0.01" defaultValue={settings.customerHourlyRate} disabled={!canManage || settings.source === "legacy"} className={premiumFieldClass} />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Materialpåslag %</span>
            <input name="materialMarkupPercent" type="number" min="0" step="0.1" defaultValue={settings.materialMarkupPercent} disabled={!canManage || settings.source === "legacy"} className={premiumFieldClass} />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Övrig kostnad</span>
            <input name="otherCost" type="number" min="0" step="0.01" defaultValue={settings.otherCost} disabled={!canManage || settings.source === "legacy"} className={premiumFieldClass} />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Fast ersättning</span>
            <input name="fixedRevenue" type="number" min="0" step="0.01" defaultValue={settings.fixedRevenue} disabled={!canManage || settings.source === "legacy"} className={premiumFieldClass} />
          </label>
          {canManage && settings.source !== "legacy" ? (
            <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2 lg:col-span-5`}>
              {saving ? "Sparar…" : "Spara lönsamhetsinställningar"}
            </button>
          ) : null}
        </form>
      </Panel>

      <Panel title="Fakturaunderlag" description="Byggs från godkänd tid och debiterbart material. Separat från fältregistreringen ovan.">
        {!draft ? (
          <EmptyState title="Inget underlag" description="Spara tid och material för att skapa fakturarader." />
        ) : (
          <div className="space-y-4">
            {draft.source === "legacy" ? (
              <p className="text-xs font-medium text-amber-800">Äldre underlag – spara ett nytt utkast (modern tabell) innan export. Kör backfill för att behålla samma version-ID.</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                value={draft.customerName}
                onChange={(event) => setDraft({ ...draft, customerName: event.target.value })}
                placeholder="Kundnamn"
                disabled={!canManage}
                className={premiumFieldClass}
              />
              <input
                value={draft.customerOrgNumber}
                onChange={(event) => setDraft({ ...draft, customerOrgNumber: event.target.value })}
                placeholder="Org.nr"
                disabled={!canManage}
                className={premiumFieldClass}
              />
              <input
                value={draft.customerReference}
                onChange={(event) => setDraft({ ...draft, customerReference: event.target.value })}
                placeholder="Kundreferens"
                disabled={!canManage}
                className={premiumFieldClass}
              />
              <input
                type="date"
                value={draft.invoiceDate}
                onChange={(event) => setDraft({ ...draft, invoiceDate: event.target.value })}
                disabled={!canManage}
                className={premiumFieldClass}
              />
            </div>
            <div className="divide-y divide-sand-100 rounded-xl border border-sand-200">
              {draft.lines.length === 0 ? (
                <div className="p-5 text-sm text-ink-500">Inga fakturarader ännu. Godkänn tid/material eller spara underlaget för att generera rader.</div>
              ) : draft.lines.map((line) => (
                <div key={line.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-ink-900">{line.description}</p>
                    <p className="text-xs text-ink-500">{line.quantity} {line.unit} · {money.format(line.unitPrice)}</p>
                  </div>
                  <p className="text-sm font-semibold text-petroleum-800">{money.format(line.total)}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
              <p>Status: <strong className="text-ink-900">{statusLabels[draft.status] || draft.status}</strong></p>
              {draft.total != null ? <p>Totalt inkl. moms: <strong className="text-ink-900">{money.format(draft.total)}</strong></p> : null}
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={() => void saveInvoice("draft")} className="rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-sand-50">
                  Spara utkast
                </button>
                <button type="button" disabled={saving} onClick={() => void saveInvoice("ready")} className={premiumPrimaryButtonClass}>
                  Markera som klar
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Fakturaexport" description="Köa export till Fortnox, Visma eller webhook när underlaget är klart.">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-ink-700">Leverantör</span>
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
              disabled={!canManage}
              className={premiumFieldClass}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                  {provider.name}{provider.configured ? "" : " · ej konfigurerad"}
                </option>
              ))}
            </select>
          </label>
          {canManage && draft?.source !== "legacy" ? (
            <button
              type="button"
              disabled={saving || !providers.some((provider) => provider.id === selectedProvider && provider.configured)}
              onClick={() => void post(`/api/work-orders/${workOrderId}/invoice-integration`, { action: "queue", provider: selectedProvider }, "Exportjobbet har lagts i kö.")}
              className={premiumPrimaryButtonClass}
            >
              {saving ? "Köar…" : "Köa export"}
            </button>
          ) : null}
        </div>
        {draft?.source === "legacy" ? (
          <p className="mt-3 text-xs font-medium text-amber-800">Äldre fakturaunderlag – spara ett nytt underlag eller kör backfill innan export.</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {exportJobs.length === 0 ? (
            <EmptyState title="Inga exportjobb" description="När underlaget är klart kan du köa en export till ekonomisystemet." />
          ) : exportJobs.map((job) => (
            <article key={job.jobId} className="rounded-xl border border-sand-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink-900">{providerLabels[job.provider] || job.provider}</p>
                <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                  {statusLabels[job.status] || job.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {job.updatedAt || job.createdAt ? dateTime.format(new Date(String(job.updatedAt || job.createdAt))) : "—"}
                {job.attempt ? ` · Försök ${job.attempt}` : ""}
              </p>
              {job.source === "legacy" ? (
                <p className="mt-2 text-xs font-medium text-amber-800">Äldre jobb – kör backfill innan omkörning eller avbryt.</p>
              ) : null}
              {job.error ? <p className="mt-2 text-xs text-red-700">{job.error}</p> : null}
              {canManage && job.source !== "legacy" && (job.status === "failed" || job.status === "queued") ? (
                <div className="mt-3 flex gap-2">
                  {job.status === "failed" ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/invoice-integration`, { action: "retry", jobId: job.jobId }, "Exportjobbet köas om.")}
                      className="rounded-lg border border-petroleum-200 bg-petroleum-50 px-3 py-1.5 text-xs font-semibold text-petroleum-900"
                    >
                      Försök igen
                    </button>
                  ) : null}
                  {job.status === "queued" ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void post(`/api/work-orders/${workOrderId}/invoice-integration`, { action: "cancel", jobId: job.jobId }, "Exportjobbet har avbrutits.")}
                      className="rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-semibold text-ink-700"
                    >
                      Avbryt
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
