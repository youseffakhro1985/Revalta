"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Clock3,
  FileSignature,
  Plus,
  Search,
  Star,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { commandCenterQuickActions } from "@/components/dashboard/command-center-actions";
import {
  addCommandCenterRecent,
  commandCenterStorageKey,
  isCommandCenterFavorite,
  parseCommandCenterState,
  sanitizeCommandCenterObject,
  toggleCommandCenterFavorite,
  type CommandCenterObject,
  type CommandCenterResultType,
  type CommandCenterState,
} from "@/components/dashboard/command-center-state";
import {
  staffPrimaryNavigation,
  staffSettingsNavigation,
  visibleDashboardItems,
  visibleDashboardSections,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-navigation";
import { readResponseJson } from "@/lib/fetch-json";

const resultIcons = {
  property: Building2,
  ticket: ClipboardList,
  work_order: Wrench,
  user: UserRound,
  lease_holder: FileSignature,
} satisfies Record<CommandCenterResultType, typeof Building2>;

const actionIcons = {
  property: Building2,
  ticket: ClipboardList,
  work_order: Wrench,
  team: Users,
};

type CommandCenterContext = {
  id: string;
  role: string;
};

type NavigationGroup = {
  label: string;
  items: DashboardNavItem[];
};

const EMPTY_STATE: CommandCenterState = { favorites: [], recents: [] };

function isContext(value: unknown): value is { user: CommandCenterContext } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const user = (value as { user?: unknown }).user;
  if (!user || typeof user !== "object" || Array.isArray(user)) return false;
  const candidate = user as Partial<CommandCenterContext>;
  return typeof candidate.id === "string" && candidate.id.length > 0 && typeof candidate.role === "string" && candidate.role.length > 0;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandCenterObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<CommandCenterContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [commandState, setCommandState] = useState<CommandCenterState>(EMPTY_STATE);
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
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 50);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || context || contextLoading) return;
    let mounted = true;
    setContextLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/settings/profile", { cache: "no-store" });
        const body = await readResponseJson(response);
        if (mounted && response.ok && isContext(body)) setContext(body.user);
      } finally {
        if (mounted) setContextLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [context, contextLoading, open]);

  useEffect(() => {
    if (!context) return;
    try {
      setCommandState(parseCommandCenterState(window.localStorage.getItem(commandCenterStorageKey(context.id))));
    } catch {
      setCommandState(EMPTY_STATE);
    }
  }, [context]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await readResponseJson<{ results?: unknown[] }>(response);
        const safeResults = response.ok && Array.isArray(data.results)
          ? data.results.map(sanitizeCommandCenterObject).filter((item): item is CommandCenterObject => Boolean(item))
          : [];
        setResults(safeResults);
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

  const navigationGroups = useMemo<NavigationGroup[]>(() => {
    if (!context) return [];
    return [
      { label: "Arbetsyta", items: visibleDashboardItems(staffPrimaryNavigation, context.role) },
      ...visibleDashboardSections(context.role).map((section) => ({ label: section.label, items: section.items })),
      { label: "Administration", items: [staffSettingsNavigation] },
    ].filter((group) => group.items.length > 0);
  }, [context]);

  const quickActions = useMemo(() => context ? commandCenterQuickActions(context.role) : [], [context]);
  const normalizedQuery = query.trim();

  function persist(next: CommandCenterState) {
    setCommandState(next);
    if (!context) return;
    try {
      window.localStorage.setItem(commandCenterStorageKey(context.id), JSON.stringify(next));
    } catch {
      // Command Center remains fully usable without local persistence.
    }
  }

  function remember(item: CommandCenterObject) {
    persist(addCommandCenterRecent(commandState, item));
  }

  function toggleFavorite(item: CommandCenterObject) {
    persist(toggleCommandCenterFavorite(commandState, item));
  }

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="hidden h-10 min-w-[280px] items-center gap-3 rounded-lg border border-sand-200 bg-white px-3 text-left text-[12px] text-ink-500 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:border-sand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 lg:flex"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
        <span className="flex-1">Sök eller kör kommando</span>
        <kbd className="rounded border border-sand-200 bg-sand-50 px-1.5 py-0.5 text-[10px] text-ink-500">⌘K</kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Öppna Revalta Command Center"
        aria-haspopup="dialog"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 lg:hidden"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-950/25 px-3 pt-[7vh] backdrop-blur-[2px] sm:px-4 sm:pt-[10vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Revalta Command Center"
          onMouseDown={close}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-sand-200 bg-[#FAFAF8] shadow-[0_24px_80px_rgba(17,34,31,0.18)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-sand-200 px-4 sm:px-5">
              <Search className="h-5 w-5 shrink-0 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök fastighet, ärende, arbetsorder, användare eller hyrespart..."
                aria-label="Sök i Revalta eller välj kommando"
                className="h-16 min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-500"
              />
              {normalizedQuery ? (
                <button type="button" onClick={() => setQuery("")} className="hidden rounded-lg px-2 py-1 text-[11px] font-medium text-ink-500 hover:bg-sand-100 sm:block">
                  Rensa
                </button>
              ) : null}
              <button type="button" onClick={close} aria-label="Stäng Command Center" className="rounded-lg p-2 text-ink-500 outline-none hover:bg-sand-100 hover:text-ink-700 focus-visible:ring-2 focus-visible:ring-petroleum-300">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[min(70vh,620px)] overflow-y-auto p-3 sm:p-4">
              {normalizedQuery.length >= 2 ? (
                <SearchResults
                  query={normalizedQuery}
                  loading={loading}
                  results={results}
                  state={commandState}
                  onOpen={(item) => { remember(item); close(); }}
                  onToggleFavorite={toggleFavorite}
                />
              ) : normalizedQuery.length === 1 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-[13px] font-semibold text-ink-700">Skriv ett tecken till</p>
                  <p className="mt-1 text-[12px] text-ink-500">Sökningen startar efter två tecken.</p>
                </div>
              ) : (
                <CommandHome
                  contextLoading={contextLoading}
                  navigationGroups={navigationGroups}
                  quickActions={quickActions}
                  state={commandState}
                  onOpenObject={(item) => { remember(item); close(); }}
                  onNavigate={close}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-sand-200 bg-white/70 px-4 py-2.5 text-[10px] text-ink-500 sm:px-5">
              <span>⌘K / Ctrl+K öppnar · Esc stänger</span>
              <span className="hidden sm:inline">Sökning och behörigheter följer din organisation</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CommandHome({
  contextLoading,
  navigationGroups,
  quickActions,
  state,
  onOpenObject,
  onNavigate,
  onToggleFavorite,
}: {
  contextLoading: boolean;
  navigationGroups: NavigationGroup[];
  quickActions: ReturnType<typeof commandCenterQuickActions>;
  state: CommandCenterState;
  onOpenObject: (item: CommandCenterObject) => void;
  onNavigate: () => void;
  onToggleFavorite: (item: CommandCenterObject) => void;
}) {
  return (
    <div className="space-y-6 py-1">
      {quickActions.length > 0 ? (
        <section aria-labelledby="command-create-heading">
          <SectionHeading id="command-create-heading" icon={Plus}>Skapa nytt</SectionHeading>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = actionIcons[action.kind];
              return (
                <Link key={action.id} href={action.href} onClick={onNavigate} className="group flex items-center gap-3 rounded-xl border border-sand-200/80 bg-white px-3.5 py-3 outline-none transition hover:border-petroleum-200 hover:shadow-premium-sm focus-visible:ring-2 focus-visible:ring-petroleum-300">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ink-800">{action.label}</span><span className="mt-0.5 block truncate text-[11px] text-ink-500">{action.description}</span></span>
                  <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {state.favorites.length > 0 ? (
        <ObjectSection title="Favoriter" icon={Star} items={state.favorites} state={state} onOpen={onOpenObject} onToggleFavorite={onToggleFavorite} />
      ) : null}

      {state.recents.length > 0 ? (
        <ObjectSection title="Senaste" icon={Clock3} items={state.recents} state={state} onOpen={onOpenObject} onToggleFavorite={onToggleFavorite} />
      ) : null}

      <section aria-labelledby="command-modules-heading">
        <SectionHeading id="command-modules-heading" icon={Building2}>Navigera</SectionHeading>
        {contextLoading && navigationGroups.length === 0 ? (
          <p className="rounded-xl border border-sand-200 bg-white px-4 py-5 text-center text-[12px] text-ink-500">Läser in dina moduler…</p>
        ) : (
          <div className="space-y-3">
            {navigationGroups.map((group) => (
              <div key={group.label} className="rounded-xl border border-sand-200/80 bg-white p-3">
                <p className="px-1 pb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-ink-500">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} onClick={onNavigate} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[12px] font-medium text-ink-600 outline-none transition hover:border-sand-200 hover:bg-sand-50 hover:text-petroleum-800 focus-visible:ring-2 focus-visible:ring-petroleum-300">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />{item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SearchResults({
  query,
  loading,
  results,
  state,
  onOpen,
  onToggleFavorite,
}: {
  query: string;
  loading: boolean;
  results: CommandCenterObject[];
  state: CommandCenterState;
  onOpen: (item: CommandCenterObject) => void;
  onToggleFavorite: (item: CommandCenterObject) => void;
}) {
  if (loading) return <p className="px-4 py-12 text-center text-[12px] text-ink-500">Söker i Revalta…</p>;
  if (results.length === 0) return <div className="px-4 py-12 text-center"><p className="text-[13px] font-semibold text-ink-700">Inga träffar för “{query}”</p><p className="mt-1 text-[12px] text-ink-500">Prova fastighetsnamn, AO-nummer, ärendereferens, person eller adress.</p></div>;

  return (
    <section aria-label="Sökresultat" className="space-y-1">
      {results.map((item) => <ObjectRow key={`${item.type}-${item.id}`} item={item} favorite={isCommandCenterFavorite(state, item)} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />)}
    </section>
  );
}

function ObjectSection({
  title,
  icon,
  items,
  state,
  onOpen,
  onToggleFavorite,
}: {
  title: string;
  icon: typeof Star;
  items: CommandCenterObject[];
  state: CommandCenterState;
  onOpen: (item: CommandCenterObject) => void;
  onToggleFavorite: (item: CommandCenterObject) => void;
}) {
  return (
    <section aria-label={title}>
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <div className="space-y-1 rounded-xl border border-sand-200/80 bg-white p-1.5">
        {items.map((item) => <ObjectRow key={`${item.type}-${item.id}`} item={item} favorite={isCommandCenterFavorite(state, item)} onOpen={onOpen} onToggleFavorite={onToggleFavorite} compact />)}
      </div>
    </section>
  );
}

function ObjectRow({
  item,
  favorite,
  compact = false,
  onOpen,
  onToggleFavorite,
}: {
  item: CommandCenterObject;
  favorite: boolean;
  compact?: boolean;
  onOpen: (item: CommandCenterObject) => void;
  onToggleFavorite: (item: CommandCenterObject) => void;
}) {
  const Icon = resultIcons[item.type];
  return (
    <div className="group flex items-center gap-1 rounded-xl transition hover:bg-white hover:shadow-[0_1px_3px_rgba(17,34,31,0.06)]">
      <Link href={item.href} onClick={() => onOpen(item)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 ${compact ? "py-2.5" : "py-3"}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-ink-800">{item.title}</span><span className="mt-0.5 block truncate text-[11px] text-ink-500">{item.subtitle}</span></span>
      </Link>
      <button
        type="button"
        onClick={() => onToggleFavorite(item)}
        aria-label={favorite ? `Ta bort ${item.title} från favoriter` : `Lägg till ${item.title} som favorit`}
        aria-pressed={favorite}
        className={`mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-petroleum-300 ${favorite ? "text-petroleum-700" : "text-ink-300 hover:bg-sand-50 hover:text-petroleum-700"}`}
      >
        <Star className="h-4 w-4" fill={favorite ? "currentColor" : "none"} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  );
}

function SectionHeading({ id, icon: Icon, children }: { id?: string; icon: typeof Plus; children: React.ReactNode }) {
  return <h2 id={id} className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500"><Icon className="h-3.5 w-3.5 text-petroleum-600" strokeWidth={1.7} aria-hidden="true" />{children}</h2>;
}
