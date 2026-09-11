"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  CreditCard,
  FileClock,
  KeyRound,
  LockKeyhole,
  MailCheck,
  Plug,
  RefreshCw,
  ShieldCheck,
  Siren,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  InlineAlert,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
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

function SummaryItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">{label}</p>
      <p className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs leading-5 text-ink-500">{hint}</p> : null}
    </div>
  );
}

function SettingsLink({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 border-b border-sand-200/70 px-5 py-4 outline-none transition-colors last:border-b-0 hover:bg-sand-50/70 focus-visible:bg-sand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleum-200 sm:px-6"
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sand-200 bg-sand-50 text-petroleum-700">
        <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-ink-900 group-hover:text-petroleum-800">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-ink-500">{description}</span>
      </span>
      <ArrowRight
        className="mt-2 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-petroleum-700"
        aria-hidden="true"
      />
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
    { href: "/dashboard/installningar/aviseringar", title: "Serviceaviseringar", description: "Automatiska servicepåminnelser, mottagare och leveransstatus.", icon: BellRing, visible: true },
    { href: "/dashboard/installningar/mina-aviseringar", title: "Mina aviseringar", description: "Vilka personliga händelser och uppdateringar du vill få.", icon: UserRound, visible: true },
    { href: "/dashboard/installningar/eskaleringar", title: "Eskaleringar", description: "Operativa eskaleringar och vidare till regelhanteringen.", icon: Siren, visible: true },
    { href: "/dashboard/team", title: "Team", description: "Användare och organisationens arbetsgrupp.", icon: UsersRound, visible: canOpenTeam },
    { href: "/dashboard/behorigheter", title: "Behörigheter", description: "Roller och åtkomst till känsliga delar av systemet.", icon: ShieldCheck, visible: canManageOrganisation },
    { href: "/dashboard/integrationer", title: "Integrationer", description: "Systemkopplingar och befintliga integrationsflöden.", icon: Plug, visible: canOpenIntegrations },
    { href: "/dashboard/audit", title: "Händelselogg", description: "Spårbara ändringar och administrativa händelser.", icon: FileClock, visible: canOpenAudit },
    { href: "/dashboard/drift", title: "Driftstatus", description: "Teknisk status och operativa systemsignaler.", icon: Activity, visible: canOpenOperationsAdmin },
    { href: "/dashboard/billing", title: "Abonnemang", description: "Abonnemangs- och betalningshantering.", icon: CreditCard, visible: canOpenBilling },
  ].filter((item) => item.visible);

  const loadingValue = (value: string | undefined | null) => value || (initialLoading ? "Laddar…" : "–");

  return (
    <div className="mx-auto max-w-7xl animate-fade-in-soft space-y-8">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-500">Administration</p>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink-950 sm:text-[36px]">
            Inställningar
          </h1>
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-6 text-ink-600">
            Konto, organisation, säkerhet och aviseringar – samt de administrationsområden din roll har tillgång till.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={initialLoading || Boolean(saving)}
          className={`${premiumSecondaryButtonClass} w-full gap-2 sm:w-auto`}
        >
          <RefreshCw className={`h-4 w-4 ${initialLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Uppdatera
        </button>
      </header>

      <div aria-live="polite" aria-atomic="true" className="space-y-2 empty:hidden">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      </div>

      <section
        aria-label="Kontosammanfattning"
        className="grid divide-y divide-sand-200/80 overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-premium-sm sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x"
      >
        <SummaryItem
          label="Inloggad som"
          value={loadingValue(profile?.email)}
          hint={profile?.email_verified_at ? "E-post verifierad" : initialLoading ? "" : "Verifiering saknas"}
        />
        <SummaryItem
          label="Organisation"
          value={loadingValue(company?.name)}
          hint={company?.org_number || "Organisationsnummer ej angivet"}
        />
        <SummaryItem
          label="Åtkomstnivå"
          value={role ? roleLabels[role] || role : initialLoading ? "Laddar…" : "–"}
          hint={`Kontostatus: ${initialLoading ? "–" : friendlyStatus(profile?.status)}`}
        />
        <SummaryItem
          label="Abonnemang"
          value={company?.plan ? planLabels[company.plan] || company.plan : initialLoading ? "Laddar…" : "–"}
          hint={canOpenBilling ? "Du kan hantera abonnemanget" : "Administreras av organisationens admin"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Profil" description="Dina personliga uppgifter. E-post och roll styrs av kontot och organisationens behörigheter.">
          <form onSubmit={saveProfile} className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-700">Namn</span>
              <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={premiumFieldClass} aria-label="Namn" placeholder="För- och efternamn" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">E-post</p>
                <p className="mt-1 break-all text-sm font-semibold text-ink-900">{profile?.email || "–"}</p>
                <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${profile?.email_verified_at ? "text-emerald-700" : "text-amber-700"}`}>
                  <MailCheck className="h-3.5 w-3.5" aria-hidden="true" /> {profile?.email_verified_at ? "Verifierad" : "Ej verifierad"}
                </p>
              </div>
              <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">Roll</p>
                <p className="mt-1 text-sm font-semibold text-ink-900">{role ? roleLabels[role] || role : "–"}</p>
                {canManageOrganisation ? <Link href="/dashboard/behorigheter" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna behörigheter <ArrowRight className="h-3 w-3" aria-hidden="true" /></Link> : null}
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
                <span className="text-[13px] font-semibold text-ink-700">Organisationsnamn</span>
                <input required maxLength={180} value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={premiumFieldClass} aria-label="Organisationsnamn" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-ink-700">Organisationsnummer</span>
                <input maxLength={40} value={orgNumber} onChange={(event) => setOrgNumber(event.target.value)} className={premiumFieldClass} placeholder="556000-0000" aria-label="Organisationsnummer" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">Plan</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{company?.plan ? planLabels[company.plan] || company.plan : "–"}</p>
                </div>
                <div className="rounded-xl border border-sand-200 bg-sand-50/70 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{friendlyStatus(company?.status)}</p>
                </div>
              </div>
              <button className={`${premiumPrimaryButtonClass} w-full sm:w-auto`}>
                {saving === "company" ? "Sparar organisation…" : "Spara organisation"}
              </button>
            </fieldset>
            {!canManageOrganisation && !initialLoading ? (
              <p className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-[13px] leading-6 text-ink-600">Du kan läsa organisationsuppgifterna men din roll får inte ändra dem.</p>
            ) : null}
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="Lösenord och sessioner" description="Ett godkänt lösenordsbyte avslutar automatiskt tidigare sessioner enligt befintligt säkerhetsflöde.">
          <form onSubmit={changePassword} className="grid gap-4 lg:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-700">Nuvarande lösenord</span>
              <input required autoComplete="current-password" type="password" maxLength={512} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={premiumFieldClass} aria-label="Nuvarande lösenord" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-700">Nytt lösenord</span>
              <input required autoComplete="new-password" type="password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={premiumFieldClass} aria-label="Nytt lösenord" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-700">Bekräfta nytt lösenord</span>
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
            <button disabled={!passwordReady || Boolean(saving)} className={`${premiumPrimaryButtonClass} w-full gap-2 lg:w-auto`}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" /> {saving === "password" ? "Uppdaterar…" : "Byt lösenord"}
            </button>
          </form>
        </Panel>

        <Panel title="Säkerhetsöversikt" description="Snabb väg till de säkerhetsfunktioner som redan finns för din roll.">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-sand-200 p-4">
              <span className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700"><KeyRound className="h-4 w-4" aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-semibold text-ink-900">Sessionsskydd</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">Lösenordsbyte använder Revaltas befintliga flöde för att avsluta äldre sessioner.</p>
              </div>
            </div>
            {canOpenAudit ? (
              <Link href="/dashboard/audit" className="group flex items-center justify-between gap-3 rounded-xl border border-sand-200 p-4 outline-none transition-colors hover:border-petroleum-200 hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-200">
                <span className="flex items-center gap-3">
                  <span className="rounded-lg bg-sand-50 p-2 text-petroleum-700"><FileClock className="h-4 w-4" aria-hidden="true" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-ink-900">Händelselogg</span>
                    <span className="mt-1 block text-xs text-ink-500">Granska spårbara administrativa händelser.</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-petroleum-700" aria-hidden="true" />
              </Link>
            ) : null}
            {canOpenOperationsAdmin ? (
              <Link href="/dashboard/arbetsorder/redigeringslas" className="group flex items-center justify-between gap-3 rounded-xl border border-sand-200 p-4 outline-none transition-colors hover:border-petroleum-200 hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-200">
                <span className="flex items-center gap-3">
                  <span className="rounded-lg bg-sand-50 p-2 text-petroleum-700"><LockKeyhole className="h-4 w-4" aria-hidden="true" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-ink-900">Redigeringslås</span>
                    <span className="mt-1 block text-xs text-ink-500">Öppna hanteringen för samtidiga arbetsorderändringar.</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-petroleum-700" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel
        title="Administrationsområden"
        description="Visar endast de områden som din nuvarande roll får öppna."
        bodyClassName="p-0"
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          {settingsLinks.map((item) => (
            <SettingsLink key={item.href} href={item.href} title={item.title} description={item.description} icon={item.icon} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
