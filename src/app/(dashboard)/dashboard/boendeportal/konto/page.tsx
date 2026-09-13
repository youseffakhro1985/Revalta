"use client";

import { useEffect, useState } from "react";
import {
  InlineAlert,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  email_verified_at: string | null;
};

export default function ResidentAccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoadingProfile(true);
      setError("");
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" });
        const data = await readResponseJson(response);
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta kontouppgifter");
          return;
        }
        setProfile(data.user);
        setName(data.user?.name || "");
      } catch {
        setError("Kunde inte kontakta servern");
      } finally {
        setLoadingProfile(false);
      }
    }

    void loadProfile();
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSavingProfile(true);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte spara profilen");
        return;
      }
      setProfile(data.user);
      setSuccess("Profilen är sparad.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSavingProfile(false);
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
    setSavingPassword(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte byta lösenord");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(data.message || "Lösenordet är uppdaterat och tidigare sessioner har avslutats.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Min boendeservice"
        title="Mitt konto"
        description="Uppdatera ditt namn och byt lösenord. Lösenordsbyte avslutar tidigare inloggningar."
      />

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Profil"
          description="Dina kontaktuppgifter i boendeportalen."
        >
          {loadingProfile ? (
            <p className="text-sm text-ink-500">Hämtar kontouppgifter…</p>
          ) : (
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label htmlFor="resident-name" className="block text-sm font-medium text-ink-700">Namn</label>
                <input
                  id="resident-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={`mt-1 ${premiumFieldClass}`}
                  autoComplete="name"
                />
              </div>
              <div className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-600">
                <p>{profile?.email || "—"}</p>
                <p className="mt-1">Roll: Boende</p>
                <p className="mt-1">
                  {profile?.email_verified_at ? "E-post verifierad" : "E-post ej verifierad"}
                </p>
              </div>
              <button
                type="submit"
                disabled={savingProfile || loadingProfile}
                className={premiumPrimaryButtonClass}
              >
                {savingProfile ? "Sparar…" : "Spara profil"}
              </button>
            </form>
          )}
        </Panel>

        <Panel
          title="Lösenord och sessioner"
          description="Välj ett starkt lösenord. Tidigare sessioner avslutas automatiskt."
        >
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label htmlFor="resident-current-password" className="block text-sm font-medium text-ink-700">
                Nuvarande lösenord
              </label>
              <input
                id="resident-current-password"
                required
                autoComplete="current-password"
                type="password"
                maxLength={512}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={`mt-1 ${premiumFieldClass}`}
              />
            </div>
            <div>
              <label htmlFor="resident-new-password" className="block text-sm font-medium text-ink-700">
                Nytt lösenord
              </label>
              <input
                id="resident-new-password"
                required
                autoComplete="new-password"
                type="password"
                minLength={10}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={`mt-1 ${premiumFieldClass}`}
              />
              <p className="mt-2 text-xs text-ink-500">Minst 10 tecken med både bokstav och siffra.</p>
            </div>
            <div>
              <label htmlFor="resident-confirm-password" className="block text-sm font-medium text-ink-700">
                Bekräfta nytt lösenord
              </label>
              <input
                id="resident-confirm-password"
                required
                autoComplete="new-password"
                type="password"
                minLength={10}
                maxLength={128}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`mt-1 ${premiumFieldClass}`}
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className={premiumPrimaryButtonClass}
            >
              {savingPassword ? "Uppdaterar…" : "Byt lösenord säkert"}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
