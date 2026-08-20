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
    <li className="flex flex-col gap-2.5 border-t border-sand-100 py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
            step.completed
              ? "border-petroleum-200 bg-petroleum-50 text-petroleum-700"
              : "border-sand-300 bg-white text-ink-300"
          }`}
          aria-hidden="true"
        >
          {step.completed ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Circle className="h-3 w-3" strokeWidth={1.7} />}
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-semibold leading-5 ${step.completed ? "text-ink-600" : "text-ink-900"}`}>{step.title}</p>
          <p className="mt-0.5 max-w-3xl text-[12px] leading-4 text-ink-500">{step.description}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0">
        {!step.completed ? (
          <Link
            href={step.href}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-sand-200 bg-white px-2.5 text-[11px] font-semibold text-petroleum-800 shadow-premium-sm transition hover:border-petroleum-200 hover:bg-petroleum-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300"
          >
            {step.actionLabel}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : (
          <span className="rounded-full border border-sand-200/80 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold text-ink-500">Klar</span>
        )}

        {isTicketIntake && !step.completed ? (
          <button
            type="button"
            onClick={onVerifyTicketIntake}
            disabled={verifying}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-petroleum-800 px-2.5 text-[11px] font-semibold text-white transition hover:bg-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            Markera verifierad
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
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="first-run-title">
      <div className="border-b border-sand-100 px-5 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-petroleum-600">Kom igång med Revalta</p>
            <h2 id="first-run-title" className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-ink-950 sm:text-[20px]">Gör organisationen redo för drift</h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-4 text-ink-500">Fem tydliga steg bygger på organisationens verkliga data och sparade inställningar.</p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-petroleum-100 bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold text-petroleum-800">
            {progress.completedCount} av {progress.totalCount} klara
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand-100" aria-label={`${progress.percent} procent av onboarding klar`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
          <div className="h-full rounded-full bg-petroleum-600 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {error ? (
        <div className="mx-5 mt-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-700 sm:mx-6" role="status">
          {error}
        </div>
      ) : null}

      <ol className="px-5 py-1 sm:px-6">
        {progress.steps.map((step) => (
          <StepRow key={step.id} step={step} verifying={verifying} onVerifyTicketIntake={verifyTicketIntake} />
        ))}
      </ol>
    </section>
  );
}
