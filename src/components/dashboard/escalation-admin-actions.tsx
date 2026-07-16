"use client";

import { useState } from "react";
import { RefreshCcw, Send } from "lucide-react";

export function EscalationAdminActions({ canManage, configured, onComplete }: { canManage: boolean; configured: boolean; onComplete: () => Promise<void> | void }) {
  const [running, setRunning] = useState<"test" | "retry" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(action: "test" | "retry") {
    setRunning(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/settings/service-escalations/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Åtgärden misslyckades");
      setMessage(action === "test" ? "Testutskicket skickades till din e-post." : "Eskaleringsmotorn kördes på nytt.");
      await onComplete();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Åtgärden misslyckades");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("test")} disabled={!canManage || !configured || running !== null} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" /> {running === "test" ? "Skickar…" : "Skicka test"}
        </button>
        <button type="button" onClick={() => void run("retry")} disabled={!canManage || !configured || running !== null} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCcw className={`h-4 w-4 ${running === "retry" ? "animate-spin" : ""}`} /> {running === "retry" ? "Kör…" : "Kör återförsök"}
        </button>
      </div>
      {!canManage ? <p className="text-sm text-ink-500">Endast ägare och administratörer kan köra manuella åtgärder.</p> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
    </div>
  );
}
