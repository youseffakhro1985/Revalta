"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, ClipboardList, FileSignature, Search, UserRound, X } from "lucide-react";

type SearchResult = {
  id: string;
  type: "property" | "ticket" | "user" | "lease_holder";
  title: string;
  subtitle: string;
  href: string;
};

const icons = {
  property: Building2,
  ticket: ClipboardList,
  user: UserRound,
  lease_holder: FileSignature,
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = await response.json();
        setResults(response.ok ? data.results || [] : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 min-w-[280px] items-center gap-3 rounded-lg border border-sand-200 bg-white px-3 text-left text-[12px] text-ink-400 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:border-sand-300 lg:flex"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
        <span className="flex-1">Sök i Revalta</span>
        <kbd className="rounded border border-sand-200 bg-sand-50 px-1.5 py-0.5 text-[10px] text-ink-400">⌘K</kbd>
      </button>

      <button type="button" onClick={() => setOpen(true)} aria-label="Sök" className="flex h-9 w-9 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 lg:hidden">
        <Search className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-950/25 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-sand-200 bg-[#FAFAF8] shadow-[0_24px_80px_rgba(17,34,31,0.18)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-sand-200 px-5">
              <Search className="h-5 w-5 text-petroleum-700" strokeWidth={1.7} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök fastighet, ärende, användare eller hyrespart..."
                className="h-16 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-400 hover:bg-sand-100 hover:text-ink-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[430px] overflow-y-auto p-3">
              {query.trim().length < 2 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] font-medium text-ink-700">Sök i hela fastighetssystemet</p>
                  <p className="mt-1 text-[12px] text-ink-400">Skriv minst två tecken för att hitta fastigheter, ärenden, användare och hyresparter.</p>
                </div>
              ) : loading ? (
                <p className="px-4 py-10 text-center text-[12px] text-ink-400">Söker...</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-10 text-center text-[12px] text-ink-400">Inga träffar hittades.</p>
              ) : (
                <div className="space-y-1">
                  {results.map((result) => {
                    const Icon = icons[result.type];
                    return (
                      <Link key={`${result.type}-${result.id}`} href={result.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white hover:shadow-[0_1px_3px_rgba(17,34,31,0.06)]">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.7} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink-800">{result.title}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-ink-400">{result.subtitle}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
