"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/logga-in");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950 ${className}`}
    >
      Logga ut
    </button>
  );
}
