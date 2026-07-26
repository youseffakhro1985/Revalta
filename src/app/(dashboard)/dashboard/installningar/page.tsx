"use client";

import { useEffect, useState } from "react";
import { readResponseJson } from "@/lib/fetch-json";

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

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [canManageCompany, setCanManageCompany] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const [profileResponse, companyResponse] = await Promise.all([
        fetch("/api/settings/profile", { cache: "no-store" }),
        fetch("/api/settings/company", { cache: "no-store" }),
      ]);
      const profileData = await readResponseJson(profileResponse);
      const companyData = await readResponseJson(companyResponse);

      if (profileResponse.ok) {
        setProfile(profileData.user);
        setName(profileData.user.name || "");
      }
      if (companyResponse.ok) {
        setCompany(companyData.company);
        setCompanyName(companyData.company?.name || "");
        setOrgNumber(companyData.company?.org_number || "");
        setCanManageCompany(Boolean(companyData.canManage));
      }
    }

    void loadSettings();
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) return setError(data.error || "Kunde inte spara profilen");
      setProfile(data.user);
      setSuccess("Profilen är sparad.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, orgNumber }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) return setError(data.error || "Kunde inte spara organisationen");
      setCompany(data.company);
      setSuccess("Organisationen är sparad.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
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
    setLoading(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) return setError(data.error || "Kunde inte byta lösenord");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(data.message || "Lösenordet är uppdaterat och tidigare sessioner har avslutats.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-soft space-y-6">
      <header className="rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Inställningar</p>
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[36px]">Organisation och konto</h1>
        <p className="mt-3 max-w-2xl text-ink-600">Hantera grunduppgifter, behörigheter och lösenord med spårbar revisionslogg.</p>
      </header>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={saveProfile} className="rounded-2xl border border-sand-200/80 bg-white p-6 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Profil</h2>
          <p className="mt-2 text-sm text-ink-500">Dina personliga uppgifter i Revalta.</p>
          <label className="mt-6 block text-sm font-medium text-ink-700">Namn</label>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" />
          <div className="mt-4 rounded-lg bg-sand-50 p-4 text-sm text-ink-600">
            <p>{profile?.email}</p>
            <p className="mt-1">Roll: {profile?.role}</p>
            <p className="mt-1">{profile?.email_verified_at ? "E-post verifierad" : "E-post ej verifierad"}</p>
          </div>
          <button disabled={loading} className="mt-6 w-full rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white hover:bg-petroleum-800 disabled:opacity-70">Spara profil</button>
        </form>

        <form onSubmit={saveCompany} className="rounded-2xl border border-sand-200/80 bg-white p-6 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Organisation</h2>
          <p className="mt-2 text-sm text-ink-500">Uppgifter som visas internt och i portalen.</p>
          <fieldset disabled={!canManageCompany || loading} className="mt-6 space-y-4 disabled:opacity-60">
            <div>
              <label className="block text-sm font-medium text-ink-700">Namn</label>
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">Organisationsnummer</label>
              <input value={orgNumber} onChange={(event) => setOrgNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" placeholder="556000-0000" />
            </div>
            <div className="rounded-lg bg-sand-50 p-4 text-sm text-ink-600">Plan: {company?.plan}</div>
            <button className="w-full rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white hover:bg-petroleum-800">Spara organisation</button>
          </fieldset>
        </form>

        <form onSubmit={changePassword} className="rounded-2xl border border-sand-200/80 bg-white p-6 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Lösenord och sessioner</h2>
          <p className="mt-2 text-sm text-ink-500">Ett lösenordsbyte avslutar automatiskt alla tidigare sessioner.</p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700">Nuvarande lösenord</label>
              <input required autoComplete="current-password" type="password" maxLength={512} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">Nytt lösenord</label>
              <input required autoComplete="new-password" type="password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" />
              <p className="mt-2 text-xs text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">Bekräfta nytt lösenord</label>
              <input required autoComplete="new-password" type="password" minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-sand-200 p-3" />
            </div>
            <button disabled={loading} className="w-full rounded-lg bg-petroleum-700 px-5 py-3 font-semibold text-white hover:bg-petroleum-800 disabled:opacity-70">{loading ? "Uppdaterar…" : "Byt lösenord säkert"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
