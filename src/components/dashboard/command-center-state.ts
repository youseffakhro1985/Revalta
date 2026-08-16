export const COMMAND_CENTER_RESULT_TYPES = ["property", "ticket", "work_order", "user", "lease_holder"] as const;

export type CommandCenterResultType = (typeof COMMAND_CENTER_RESULT_TYPES)[number];

export type CommandCenterObject = {
  id: string;
  type: CommandCenterResultType;
  title: string;
  subtitle: string;
  href: string;
};

export type CommandCenterState = {
  favorites: CommandCenterObject[];
  recents: CommandCenterObject[];
};

const MAX_FAVORITES = 6;
const MAX_RECENTS = 8;
const RESULT_TYPES = new Set<string>(COMMAND_CENTER_RESULT_TYPES);

export function commandCenterStorageKey(userId: string) {
  return `revalta.command-center.v1:${userId}`;
}

export function sanitizeCommandCenterObject(value: unknown): CommandCenterObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<CommandCenterObject>;
  if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 120) return null;
  if (typeof item.type !== "string" || !RESULT_TYPES.has(item.type)) return null;
  if (typeof item.title !== "string" || item.title.length < 1 || item.title.length > 180) return null;
  if (typeof item.subtitle !== "string" || item.subtitle.length > 260) return null;
  if (typeof item.href !== "string" || item.href.length > 500 || !/^\/dashboard(?:\/|$)/.test(item.href)) return null;
  return item as CommandCenterObject;
}

function sanitizeList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  const result: CommandCenterObject[] = [];
  const seen = new Set<string>();
  for (const valueItem of value) {
    const item = sanitizeCommandCenterObject(valueItem);
    if (!item) continue;
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function parseCommandCenterState(raw: string | null): CommandCenterState {
  if (!raw) return { favorites: [], recents: [] };
  try {
    const value = JSON.parse(raw) as { favorites?: unknown; recents?: unknown };
    return {
      favorites: sanitizeList(value?.favorites, MAX_FAVORITES),
      recents: sanitizeList(value?.recents, MAX_RECENTS),
    };
  } catch {
    return { favorites: [], recents: [] };
  }
}

function itemKey(item: CommandCenterObject) {
  return `${item.type}:${item.id}`;
}

export function addCommandCenterRecent(state: CommandCenterState, item: CommandCenterObject): CommandCenterState {
  const safe = sanitizeCommandCenterObject(item);
  if (!safe) return state;
  const key = itemKey(safe);
  return { ...state, recents: [safe, ...state.recents.filter((entry) => itemKey(entry) !== key)].slice(0, MAX_RECENTS) };
}

export function toggleCommandCenterFavorite(state: CommandCenterState, item: CommandCenterObject): CommandCenterState {
  const safe = sanitizeCommandCenterObject(item);
  if (!safe) return state;
  const key = itemKey(safe);
  const exists = state.favorites.some((entry) => itemKey(entry) === key);
  return {
    ...state,
    favorites: exists
      ? state.favorites.filter((entry) => itemKey(entry) !== key)
      : [safe, ...state.favorites].slice(0, MAX_FAVORITES),
  };
}

export function isCommandCenterFavorite(state: CommandCenterState, item: CommandCenterObject) {
  return state.favorites.some((entry) => itemKey(entry) === itemKey(item));
}
