"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-sand-100 hover:text-petroleum-700 disabled:opacity-60"
    >
      {loading ? "Loggar ut..." : "Logga ut"}
    </button>
  );
}
