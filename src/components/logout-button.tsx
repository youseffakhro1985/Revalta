"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readResponseJson } from "@/lib/fetch-json";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      const body = await readResponseJson<{ success?: boolean }>(response);
      if (!response.ok || body.success !== true) return;
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_AUTH_CACHE" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-medium text-ink-500 transition-colors hover:bg-white hover:text-petroleum-700 disabled:opacity-60 ${className}`}
    >
      {loading ? "Loggar ut..." : "Logga ut"}
    </button>
  );
}
