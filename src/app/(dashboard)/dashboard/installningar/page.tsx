"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  CreditCard,
  FileClock,
  KeyRound,
  LockKeyhole,
  MailCheck,
  Plug,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Siren,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  InlineAlert,
  MetricCard,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";
import {
  canManageBilling,
  canManageCompany,
  canManageIntegrations,
  canManageTeam,
  canViewAudit,
  canViewLeasingData,
  canViewOperations,
} from "@/lib/permissions";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  email_verified_at: string | null;
};

type Company = {
  id: string;
  name: string;
  org_number: string | null;
  plan: string;
  status: string;
};

type SavingArea = "profile" | "company" | "password" | "";

const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  manager: "Förvaltare",
  technician: "Tekniker",
  viewer: "Läsbehörig",
  resident: "Boende",
};

const planLabels: Record<string, string> = {
  start: "Start",
  professional: "Standard",
  enterprise: "Professional",
};

const statusLabels: Record<string, string> = {
  active: "Aktiv",
  enabled: "Aktiv",
  invited: "Inbjuden",
  pending: "Väntar",
  suspended: "Pausad",
  inactive: "Inaktiv",
};

function friendlyStatus(value: string | undefined | null) {
  if (!value) return "–";
  return statusLabels[value.toLowerCase()] || value;
}

function SettingsLink({
  href,
  title,
  description,
  icon: Icon,
  eyebrow,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Settings2;
  eyebrow: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[154px] flex-col justify-between rounded-2xl border border-sand-200/80 bg-white p-5 shadow-premium-sm outline-none transition-[transform,border-color,box-shadow,background-color] hover:-translate-y-0.5 hover:border-petroleum-200 hover:shadow-premium-md focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sand-200 bg-sand-50 text-petroleum-700">
          <Icon className="h-4.5 w-4.5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <ArrowRight className="h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">{eyebrow}</p>
        <h3 className="mt-1.5 text-[15px] font-semibold text-ink-950">{title}</h3>
        <p className="mt-1.5 text-sm leading-5 text-ink-500">{description}</p>
      </div>
    </Link>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [canManageCompanyResponse, setCanManageCompanyResponse] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState<SavingArea>("");

  const role = profile?.role || "";
  const canManageOrganisation = canManageCompanyResponse && canManageCompany(role);
  const canOpenTeam = canManageTeam(role) || canViewLeasingData(role);
  const canOpenIntegrations = canManageIntegrations(role);
  const canOpenAudit = canViewAudit(role);
  const canOpenOperationsAdmin = canViewOperations(role);
  const canOpenBilling = canManageBilling(role);

  const passwordReady = useMemo(() => {
    return newPassword.length >= 10
      && /[A-Za-zÅÄÖåäö]/.test(newPassword)
      && /\d/.test(newPassword)
      && newPassword === confirmPassword
      && currentPassword.length > 0;
  }, [currentPassword, newPassword, confirmPassword]);

  const loadSettings = useCallback(async () => {
    setInitialLoading(true);
    setError("");
    try {
      const [profileResponse, companyResponse] = await Promise.all([
        fetch("/api/settings/profile", { cache: "no-store" }),
        fetch("/api/settings/company", { cache: "no-store" }),
      ]);

      if (profileResponse.status === 401 || companyResponse.status === 401) {
        router.replace("/login");
        return;
      }

      const profileData = await readResponseJson(profileResponse);
      const companyData = await readResponseJson(companyResponse);

      if (!profileResponse.ok) throw new Error(profileData.error || "Kunde inte hämta kontoinställningarna");
      if (!companyResponse.ok) throw new Error(companyData.error || "Kunde inte hämta organisationsinställningarna");

      setProfile(profileData.user);
      setName(profileData.user.name || "");
      setCompany(companyData.company || null);
      setCompanyName(companyData.company?.name || "");
      setOrgNumber(companyData.company?.org_number || "");
      setCanManageCompanyResponse(Boolean(companyData.canManage));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta inställningarna");
    } finally {
      setInitialLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving("profile");
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await readResponseJson(response);
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error(data.error || "Kunde inte spara profilen");
      setProfile(data.user);
      setName(data.user.name || "");
      setSuccess("Profilen är sparad.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara profilen");
    } finally {
      setSaving("");
    }
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving("company");
    try {
      const response = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, orgNumber }),
      });
      const data = await readResponseJson(response);
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error(data.error || "Kunde inte spara organisationen");
      setCompany(data.company);
      setCompanyName(data.company?.name || "");
      setOrgNumber(data.company?.org_number || "");
      setSuccess("Organisationen är sparad.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara organisationen");
    } finally {
      setSaving("");
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("De nya lösenorden matchar inte.");
      return;
    }
    setSaving("password");
    try {
      const response = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await readResponseJson(response);
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error(data.error || "Kunde inte byta lösenord");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(data.message || "Lösenordet är uppdaterat och tidigare sessioner har avslutats.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte byta lösenord");
    } finally {
      setSaving("");
    }
  }

  const settingsLinks = [
    { href: "/dashboard/installningar/aviseringar", title: "Serviceaviseringar", description: "Styr automatiska servicepåminnelser, mottagare och leveransstatus.", icon: BellRing, eyebrow: "Aviseringar", visible: true },
    { href: "/dashboard/installningar/mina-aviseringar", title: "Mina aviseringar", description: "Anpassa vilka personliga händelser och uppdateringar du vill få.", icon: UserRound, eyebrow: "Personligt", visible: true },
    { href: "/dashboard/installningar/eskaleringar", title: "Eskaleringar", description: "Följ operativa eskaleringar och gå vidare till regelhanteringen.", icon: Siren, eyebrow: "Drift", visible: true },
    { href: "/dashboard/team", title: "Team", description: "Hantera användare och organisationens arbetsgrupp.", icon: UsersRound, eyebrow: "Organisation", visible: canOpenTeam },
    { href: "/dashboard/behorigheter", title: "Behörigheter", description: "Kontrollera roller och åtkomst till känsliga delar av systemet.", icon: ShieldCheck, eyebrow: "Åtkomst", visible: canManageOrganisation },
    { href: "/dashboard/integrationer", title: "Integrationer", description: "Hantera systemkopplingar och befintliga integrationsflöden.", icon: Plug, eyebrow: "System", visible: canOpenIntegrations },
    { href: "/dashboard/audit", title: "Händelselogg", description: "Granska spårbara ändringar och administrativa händelser.", icon: FileClock, eyebrow: "Säkerhet", visible: canOpenAudit },
    { href: "/dashboard/drift", title: "Driftstatus", description: "Kontrollera teknisk status och operativa systemsignaler.", icon: Activity, eyebrow: "System", visible: canOpenOperationsAdmin },
    { href: "/dashboard/billing", title: "Abonnemang", description: "Öppna Revaltas befintliga abonnemangs- och betalningshantering.", icon: CreditCard, eyebrow: "Abonnemang", visible: canOpenBilling },
  ].filter((item) => item.visible);

  return (
    <div className="mx-auto max-w-7xl animate-fade-in-soft space-y-6">
      <header className="overflow-hidden rounded-2xl border border-sand-200/80 bg-white shadow-premium-sm">
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Administration</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Live-data
              </span>
            </div>
            <h1 className="mt-3 text-[32px] font-semibold leading-tight tracking-[-0.04em] text-ink-950 sm:text-[38px]">Inställningar</h1>
            <p className="mt-3 max-w-3xl text-[15px] leading-6 text-ink-600">Ett samlat nav för konto, organisation, säkerhet, aviseringar och de administrationsområden din roll har tillgång till.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadSettings()}
            disabled={initialLoading || Boolean(saving)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 shadow-sm outline-none transition-colors hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${initialLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Uppdatera
          </button>
        </div>
        <div className="grid border-t border-sand-100 sm:grid-cols-3">
          <div className="px-6 py-4 sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Inloggad som</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-800">{profile?.email || (initialLoading ? "Laddar…" : "–")}</p>
          </div>
          <div className="border-t border-sand-100 px-6 py-4 sm:border-l sm:border-t-0 sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Organisation</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-800">{company?.name || (initialLoading ? "Laddar…" : "–")}</p>
          </div>
          <div className="border-t border-sand-100 px-6 py-4 sm:border-l sm:border-t-0 sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Åtkomstnivå</p>
            <p className="mt-1 text-sm font-semibold text-ink-800">{role ? roleLabels[role] || role : initialLoading ? "Laddar…" : "–"}</p>
          </div>
        </div>
      </header>

      <div aria-live="polite" aria-atomic="true" className="space-y-2">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BadgeCheck} label="Kontostatus" value={initialLoading ? "–" : friendlyStatus(profile?.status)} hint={profile?.email_verified_at ? "E-post verifierad" : "Verifiering saknas"} />
        <MetricCard icon={Building2} label="Organisation" value={initialLoading ? "–" : friendlyStatus(company?.status)} hint={company?.org_number || "Organisationsnummer ej angivet"} />
        <MetricCard icon={WalletCards} label="Abonnemang" value={initialLoading ? "–" : company?.plan ? planLabels[company.plan] || company.plan : "–"} hint={canOpenBilling ? "Du kan hantera abonnemanget" : "Administreras av organisationens admin"} />
        <MetricCard icon={ShieldCheck} label="Säkerhet" value={profile?.email_verified_at ? "Verifierad" : initialLoading ? "–" : "Kontrollera"} hint="Lösenordsbyte avslutar äldre sessioner" />
      </section>

      <section>
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Snabb åtkomst</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink-950">Administrationsområden</h2>
          </div>
          <p className="text-sm text-ink-500">Visar endast områden som din nuvarande roll får öppna.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {settingsLinks.map((item) => <SettingsLink key={item.href} {...item} />)}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Profil" description="Dina personliga uppgifter i Revalta. E-post och roll styrs av kontot och organisationens behörigheter.">
          <form onSubmit={saveProfile} className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink-700">Namn</span>
              <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} aria-label="Namn" placeholder="För- och efternamn" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">E-post</p>
                <p className="mt-1 break-all text-sm font-semibold text-ink-800">{profile?.email || "–"}</p>
                <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${profile?.email_verified_at ? "text-emerald-700" : "text-amber-700"}`}>
                  <MailCheck className="h-3.5 w-3.5" aria-hidden="true" /> {profile?.email_verified_at ? "Verifierad" : "Ej verifierad"}
                </p>
              </div>
              <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Roll</p>
                <p className="mt-1 text-sm font-semibold text-ink-800">{role ? roleLabels[role] || role : "–"}</p>
                {canManageOrganisation ? <Link href="/dashboard/behorigheter" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna behörigheter <ArrowRight className="h-3 w-3" /></Link> : null}
              </div>
            </div>
            <button disabled={initialLoading || Boolean(saving)} className={`${premiumPrimaryButtonClass} w-full sm:w-auto`}>
              {saving === "profile" ? "Sparar profil…" : "Spara profil"}
            </button>
          </form>
        </Panel>

        <Panel title="Organisation" description="Grunduppgifter för den organisation du arbetar i. Ändringar följer befintlig organisationsbehörighet.">
          <form onSubmit={saveCompany} className="space-y-5">
            <fieldset disabled={!canManageOrganisation || initialLoading || Boolean(saving)} className="space-y-4 disabled:opacity-60">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Organisationsnamn</span>
                <input required maxLength={180} value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={premiumFieldClass} aria-label="Organisationsnamn" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Organisationsnummer</span>
                <input maxLength={40} value={orgNumber} onChange={(event) => setOrgNumber(event.target.value)} className={premiumFieldClass} placeholder="556000-0000" aria-label="Organisationsnummer" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Plan</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800">{company?.plan ? planLabels[company.plan] || company.plan : "–"}</p>
                </div>
                <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Status</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800">{friendlyStatus(company?.status)}</p>
                </div>
              </div>
              <button className={`${premiumPrimaryButtonClass} w-full sm:w-auto`}>
                {saving === "company" ? "Sparar organisation…" : "Spara organisation"}
              </button>
            </fieldset>
            {!canManageOrganisation && !initialLoading ? (
              <p className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm text-ink-600">Du kan läsa organisationsuppgifterna men din roll får inte ändra dem.</p>
            ) : null}
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="Lösenord och sessioner" description="Byt lösenord här. Ett godkänt lösenordsbyte avslutar automatiskt tidigare sessioner enligt befintligt säkerhetsflöde.">
          <form onSubmit={changePassword} className="grid gap-4 lg:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink-700">Nuvarande lösenord</span>
              <input required autoComplete="current-password" type="password" maxLength={512} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={premiumFieldClass} aria-label="Nuvarande lösenord" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink-700">Nytt lösenord</span>
              <input required autoComplete="new-password" type="password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={premiumFieldClass} aria-label="Nytt lösenord" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink-700">Bekräfta nytt lösenord</span>
              <input required autoComplete="new-password" type="password" minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={premiumFieldClass} aria-label="Bekräfta nytt lösenord" />
            </label>
            <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <span className={newPassword.length >= 10 ? "font-semibold text-emerald-700" : "text-ink-500"}>Minst 10 tecken</span>
                <span className={/[A-Za-zÅÄÖåäö]/.test(newPassword) ? "font-semibold text-emerald-700" : "text-ink-500"}>Minst en bokstav</span>
                <span className={/\d/.test(newPassword) ? "font-semibold text-emerald-700" : "text-ink-500"}>Minst en siffra</span>
                <span className={confirmPassword && newPassword === confirmPassword ? "font-semibold text-emerald-700" : "text-ink-500"}>Lösenorden matchar</span>
              </div>
            </div>
            <button disabled={!passwordReady || Boolean(saving)} className={`${premiumPrimaryButtonClass} w-full lg:w-auto`}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" /> {saving === "password" ? "Uppdaterar…" : "Byt lösenord"}
            </button>
          </form>
        </Panel>

        <Panel title="Säkerhetsöversikt" description="Snabb väg till de säkerhetsfunktioner som redan finns för din roll.">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-sand-200 p-4">
              <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700"><KeyRound className="h-4 w-4" /></span>
              <div><p className="text-sm font-semibold text-ink-900">Sessionsskydd</p><p className="mt-1 text-xs leading-5 text-ink-500">Lösenordsbyte använder Revaltas befintliga flöde för att avsluta äldre sessioner.</p></div>
            </div>
            {canOpenAudit ? <Link href="/dashboard/audit" className="group flex items-center justify-between rounded-xl border border-sand-200 p-4 hover:border-petroleum-200 hover:bg-sand-50"><div className="flex items-center gap-3"><span className="rounded-lg bg-sand-50 p-2 text-petroleum-700"><FileClock className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-ink-900">Händelselogg</p><p className="mt-1 text-xs text-ink-500">Granska spårbara administrativa händelser.</p></div></div><ArrowRight className="h-4 w-4 text-ink-300 group-hover:text-petroleum-700" /></Link> : null}
            {canOpenOperationsAdmin ? <Link href="/dashboard/arbetsorder/redigeringslas" className="group flex items-center justify-between rounded-xl border border-sand-200 p-4 hover:border-petroleum-200 hover:bg-sand-50"><div className="flex items-center gap-3"><span className="rounded-lg bg-sand-50 p-2 text-petroleum-700"><LockKeyhole className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-ink-900">Redigeringslås</p><p className="mt-1 text-xs text-ink-500">Öppna hanteringen för samtidiga arbetsorderändringar.</p></div></div><ArrowRight className="h-4 w-4 text-ink-300 group-hover:text-petroleum-700" /></Link> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}
