"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Circle, Loader2 } from "lucide-react";
import type { OnboardingProgress, OnboardingStep } from "@/lib/onboarding";
import { readResponseJson } from "@/lib/fetch-json";

type OnboardingResponse = {
  eligible?: boolean;
  progress?: OnboardingProgress | null;
  error?: string;
};

function StepRow({
  step,
  verifying,
  onVerifyTicketIntake,
}: {
  step: OnboardingStep;
  verifying: boolean;
  onVerifyTicketIntake: () => void;
}) {
  const isTicketIntake = step.id === "ticket-intake";

  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-sand-100 py-2 first:border-t-0">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          step.completed
            ? "border-petroleum-200 bg-petroleum-50 text-petroleum-700"
            : "border-sand-300 bg-white text-ink-300"
        }`}
        aria-hidden="true"
      >
        {step.completed ? <Check className="h-3 w-3" strokeWidth={2.1} /> : <Circle className="h-2.5 w-2.5" strokeWidth={1.7} />}
      </span>

      <div className="min-w-0 md:flex md:items-baseline md:gap-2.5">
        <p className={`shrink-0 text-[12px] font-semibold leading-4 ${step.completed ? "text-ink-600" : "text-ink-900"}`}>{step.title}</p>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-ink-400 md:mt-0">{step.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!step.completed ? (
          <Link
            href={step.href}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-sand-200 bg-white px-2 text-[10px] font-semibold text-petroleum-800 shadow-premium-sm transition hover:border-petroleum-200 hover:bg-petroleum-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300"
          >
            <span className="hidden sm:inline">{step.actionLabel}</span>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : (
          <span className="rounded-full border border-sand-200/80 bg-sand-50 px-2 py-0.5 text-[9px] font-semibold text-ink-500">Klar</span>
        )}

        {isTicketIntake && !step.completed ? (
          <button
            type="button"
            onClick={onVerifyTicketIntake}
            disabled={verifying}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-petroleum-800 px-2 text-[10px] font-semibold text-white transition hover:bg-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            <span className="hidden lg:inline">Markera verifierad</span>
            <span className="lg:hidden">Verifiera</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function FirstRunOnboarding() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const body = await readResponseJson<OnboardingResponse>(response);
        if (!active) return;
        if (!response.ok) {
          setError(body.error || "Kunde inte läsa onboardingstatus");
          return;
        }
        setEligible(Boolean(body.eligible));
        setProgress(body.progress || null);
      } catch {
        if (active) setError("Kunde inte läsa onboardingstatus");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, []);

  async function verifyTicketIntake() {
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-ticket-intake" }),
      });
      const body = await readResponseJson<OnboardingResponse & { success?: boolean }>(response);
      if (!response.ok) {
        setError(body.error || "Kunde inte verifiera felanmälan");
        return;
      }
      setProgress(body.progress || null);
    } catch {
      setError("Kunde inte verifiera felanmälan");
    } finally {
      setVerifying(false);
    }
  }

  if (loading || !eligible || !progress || progress.complete) return null;

  return (
    <section className="overflow-hidden rounded-[18px] border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="first-run-title">
      <div className="border-b border-sand-100 px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-petroleum-600">Kom igång med Revalta</p>
              <span className="hidden h-1 w-1 rounded-full bg-sand-300 sm:block" aria-hidden="true" />
              <p className="hidden text-[10px] text-ink-400 sm:block">Fem steg till en komplett arbetsyta</p>
            </div>
            <h2 id="first-run-title" className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-ink-950 sm:text-[17px]">Gör organisationen redo för drift</h2>
          </div>

          <span className="inline-flex shrink-0 items-center rounded-full border border-petroleum-100 bg-petroleum-50 px-2 py-0.5 text-[9px] font-semibold text-petroleum-800">
            {progress.completedCount}/{progress.totalCount} klara
          </span>
        </div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand-100" aria-label={`${progress.percent} procent av onboarding klar`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
          <div className="h-full rounded-full bg-petroleum-600 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-1.5 text-[11px] text-warning-700 sm:mx-5" role="status">
          {error}
        </div>
      ) : null}

      <ol className="px-4 py-0.5 sm:px-5">
        {progress.steps.map((step) => (
          <StepRow key={step.id} step={step} verifying={verifying} onVerifyTicketIntake={verifyTicketIntake} />
        ))}
      </ol>
    </section>
  );
}
