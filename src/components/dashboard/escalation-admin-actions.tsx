"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useState } from "react";
import { RefreshCcw, Send, ShieldAlert } from "lucide-react";

type Action = "test" | "retry";

export function EscalationAdminActions({
  canManage,
  configured,
  onComplete,
}: {
  canManage: boolean;
  configured: boolean;
  onComplete: () => Promise<void> | void;
}) {
  const [running, setRunning] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(action: Action) {
    setRunning(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/settings/service-escalations/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Åtgärden misslyckades");
      setMessage(action === "test" ? "Testutskicket skickades till din e-postadress." : "Eskaleringsmotorn kördes manuellt och resultatet har loggats.");
      await onComplete();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Åtgärden misslyckades");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => void run("test")} disabled={!canManage || !configured || running !== null} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" /> {running === "test" ? "Skickar test…" : "Skicka testutskick"}
        </button>
        <button type="button" onClick={() => void run("retry")} disabled={!canManage || !configured || running !== null} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCcw className={`h-4 w-4 ${running === "retry" ? "animate-spin" : ""}`} /> {running === "retry" ? "Kör motorn…" : "Kör eskaleringsmotorn nu"}
        </button>
      </div>

      {!canManage ? <div className="flex items-start gap-2 rounded-xl bg-sand-50 p-4 text-sm text-ink-600"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Endast ägare och administratörer kan köra manuella driftåtgärder.</div> : null}
      {canManage && !configured ? <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Komplettera CRON_SECRET, EMAIL_PROVIDER_API_KEY och EMAIL_FROM innan åtgärderna kan användas.</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800" role="status">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</div> : null}
    </div>
  );
}
