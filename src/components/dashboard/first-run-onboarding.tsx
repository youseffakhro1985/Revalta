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
    <li className="flex flex-col gap-4 border-t border-sand-100 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            step.completed
              ? "border-petroleum-200 bg-petroleum-50 text-petroleum-700"
              : "border-sand-300 bg-white text-ink-300"
          }`}
          aria-hidden="true"
        >
          {step.completed ? <Check className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${step.completed ? "text-ink-500" : "text-ink-900"}`}>{step.title}</p>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-500">{step.description}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-10 sm:pl-0">
        {!step.completed ? (
          <Link
            href={step.href}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3 text-xs font-semibold text-petroleum-800 transition hover:border-petroleum-200 hover:bg-petroleum-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300"
          >
            {step.actionLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="rounded-full bg-sand-50 px-3 py-1.5 text-xs font-semibold text-ink-500">Klar</span>
        )}

        {isTicketIntake && !step.completed ? (
          <button
            type="button"
            onClick={onVerifyTicketIntake}
            disabled={verifying}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-petroleum-800 px-3 text-xs font-semibold text-white transition hover:bg-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
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
      <div className="border-b border-sand-100 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Kom igång med Revalta</p>
            <h2 id="first-run-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">Gör organisationen redo för drift</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Fem tydliga steg ersätter en tom dashboard. Progressen bygger på organisationens verkliga data och sparade inställningar.</p>
          </div>
          <p className="text-sm font-semibold text-petroleum-800">{progress.completedCount} av {progress.totalCount} klara</p>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-sand-100" aria-label={`${progress.percent} procent av onboarding klar`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
          <div className="h-full rounded-full bg-petroleum-700 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {error ? (
        <div className="mx-5 mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 sm:mx-7" role="status">
          {error}
        </div>
      ) : null}

      <ol className="px-5 py-2 sm:px-7">
        {progress.steps.map((step) => (
          <StepRow key={step.id} step={step} verifying={verifying} onVerifyTicketIntake={verifyTicketIntake} />
        ))}
      </ol>
    </section>
  );
}
