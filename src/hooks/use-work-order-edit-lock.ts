"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Holder = { userId: string; name: string | null; email: string; acquiredAt: string; expiresAt: string };
type LockState =
  | { status: "idle" | "acquiring"; token: null; version: null; holder: null; expiresAt: "" }
  | { status: "owned"; token: string; version: string; holder: null; expiresAt: string }
  | { status: "locked"; token: null; version: string | null; holder: Holder; expiresAt: string }
  | { status: "lost" | "error"; token: null; version: string | null; holder: null; expiresAt: ""; message: string };

const initialState: LockState = { status: "idle", token: null, version: null, holder: null, expiresAt: "" };

export function useWorkOrderEditLock(workOrderId: string, enabled: boolean) {
  const [state, setState] = useState<LockState>(initialState);
  const tokenRef = useRef<string | null>(null);

  const acquire = useCallback(async () => {
    if (!enabled || !workOrderId) return;
    setState({ status: "acquiring", token: null, version: null, holder: null, expiresAt: "" });
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire", leaseSeconds: 120 }),
      });
      const data = await response.json();
      if (response.status === 423) {
        tokenRef.current = null;
        setState({
          status: "locked",
          token: null,
          version: data.version || null,
          holder: data.holder,
          expiresAt: data.holder?.expiresAt || new Date().toISOString(),
        });
        return;
      }
      if (!response.ok) throw new Error(data.error || "Kunde inte låsa arbetsordern för redigering");
      tokenRef.current = data.lock.token;
      setState({
        status: "owned",
        token: data.lock.token,
        version: data.lock.version,
        holder: null,
        expiresAt: data.lock.expiresAt,
      });
    } catch (error) {
      tokenRef.current = null;
      setState({ status: "error", token: null, version: null, holder: null, expiresAt: "", message: error instanceof Error ? error.message : "Kunde inte skapa redigeringslås" });
    }
  }, [enabled, workOrderId]);

  const setVersion = useCallback((version: string) => {
    setState((current) => current.status === "owned" ? { ...current, version } : current);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(initialState);
      return;
    }
    void acquire();
  }, [acquire, enabled]);

  const ownedVersion = state.status === "owned" ? state.version : null;

  useEffect(() => {
    if (ownedVersion === null) return;
    const currentVersion = ownedVersion;
    const interval = window.setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const response = await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "renew", token, leaseSeconds: 120 }),
        });
        const data = await response.json();
        if (!response.ok) {
          tokenRef.current = null;
          setState({ status: "lost", token: null, version: currentVersion, holder: null, expiresAt: "", message: data.error || "Redigeringslåset har gått förlorat" });
          return;
        }
        setState((current) => current.status === "owned" ? { ...current, expiresAt: data.lock.expiresAt } : current);
      } catch {
        // Behåll låset till nästa förnyelse; tillfälliga nätverksfel ska inte omedelbart kasta bort användarens arbete.
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [ownedVersion, workOrderId]);

  useEffect(() => () => {
    const token = tokenRef.current;
    if (!token) return;
    void fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", token }),
      keepalive: true,
    });
    tokenRef.current = null;
  }, [workOrderId]);

  return { state, acquire, setVersion };
}
