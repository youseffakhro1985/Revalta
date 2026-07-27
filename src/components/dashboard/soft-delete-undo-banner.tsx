"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readResponseJson } from "@/lib/fetch-json";

type SoftDeleteUndoBannerProps = {
  /** Swedish noun phrase, e.g. "Ärendet" */
  entityLabel: string;
  restoreApiPath: (id: string) => string;
  detailPath?: (id: string) => string;
  onRestored?: () => void;
  paramName?: string;
};

function SoftDeleteUndoBannerInner({
  entityLabel,
  restoreApiPath,
  detailPath,
  onRestored,
  paramName = "deleted",
}: SoftDeleteUndoBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deletedId = searchParams.get(paramName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (!deletedId || dismissed) return null;

  function clearParam() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(paramName);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(restoreApiPath(deletedId!), { method: "POST" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || `Kunde inte återställa ${entityLabel.toLowerCase()}`);
      setDismissed(true);
      clearParam();
      onRestored?.();
      if (detailPath) {
        router.push(detailPath(deletedId!));
      } else {
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Kunde inte återställa ${entityLabel.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <p>{entityLabel} har tagits bort och kan återställas.</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void restore()}
            className="text-sm font-semibold text-petroleum-800 underline underline-offset-2 transition hover:text-petroleum-950 disabled:opacity-60"
          >
            {busy ? "Återställer…" : "Återställ"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDismissed(true);
              clearParam();
            }}
            className="text-sm font-medium text-ink-500 transition hover:text-ink-800 disabled:opacity-60"
          >
            Stäng
          </button>
        </div>
      </div>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}

export function SoftDeleteUndoBanner(props: SoftDeleteUndoBannerProps) {
  return (
    <Suspense fallback={null}>
      <SoftDeleteUndoBannerInner {...props} />
    </Suspense>
  );
}
