import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export const authInputClass =
  "mt-2 block h-12 w-full rounded-xl border border-sand-300 bg-white px-3.5 text-[15px] text-ink-950 shadow-[0_1px_2px_rgba(17,34,31,0.03)] outline-none transition placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-4 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50";

export const authButtonClass =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-petroleum-700 px-5 text-[14px] font-semibold text-white shadow-premium-sm transition-colors hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function AuthAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" | "neutral" }) {
  const toneClass =
    tone === "error"
      ? "border-danger-500/40 bg-danger-50 text-danger-700"
      : tone === "success"
        ? "border-success-500/40 bg-success-50 text-success-700"
        : "border-sand-200 bg-sand-50 text-ink-700";

  return (
    <div aria-live="polite" className={`mt-6 rounded-xl border p-4 text-sm leading-6 ${toneClass}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAF8] px-4 py-8 text-ink-950 sm:px-6 lg:flex lg:items-center lg:py-12">
      <div className="pointer-events-none absolute inset-y-0 left-[8%] hidden w-px bg-sand-200/70 xl:block" />
      <div className="pointer-events-none absolute inset-y-0 right-[8%] hidden w-px bg-sand-200/70 xl:block" />

      <div className="relative mx-auto w-full max-w-[1080px]">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-petroleum-800 transition-colors hover:text-petroleum-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/30 focus-visible:ring-offset-4">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Till Revalta
        </Link>

        <div className="grid overflow-hidden rounded-[28px] border border-sand-200 bg-white shadow-premium-lg lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="hidden border-r border-sand-200 bg-[#F3F3EE] p-12 lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="font-display text-[25px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</p>
              <p className="mt-7 max-w-sm font-display text-[35px] font-semibold leading-[1.15] tracking-[-0.035em] text-ink-950">
                Samlad förvaltning med lugnare arbetsflöden.
              </p>
              <p className="mt-5 max-w-sm text-[15px] leading-7 text-ink-600">
                Fastigheter, ärenden, arbetsorder och ekonomi i en säker arbetsyta för svenska förvaltningsteam.
              </p>
            </div>

            <div className="mt-12 space-y-4 border-t border-sand-300 pt-7">
              {["Rollstyrd åtkomst", "Spårbara arbetsflöden", "Data avgränsad per organisation"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-ink-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-petroleum-200 bg-white text-petroleum-700">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </aside>

          <section aria-labelledby="auth-title" className="p-7 sm:p-10 lg:p-12">
            <div className="flex items-center gap-2 text-petroleum-700">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em]">{eyebrow}</p>
            </div>
            <h1 id="auth-title" className="mt-4 font-display text-[34px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[40px]">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-ink-600">{description}</p>

            {children}

            {footer ? <div className="mt-7 border-t border-sand-200 pt-6 text-center text-sm text-ink-500">{footer}</div> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
