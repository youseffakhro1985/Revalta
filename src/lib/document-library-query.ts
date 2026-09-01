export const DOCUMENT_LIBRARY_PAGE_SIZE = 25;
export const DOCUMENT_LIBRARY_MAX_PAGE_SIZE = 100;

export type DocumentLibrarySort = "newest" | "oldest" | "name" | "expiry";
export type DocumentLibraryFocus = "all" | "attention" | "resident" | "internal" | "archived";

const allowedSorts = new Set<DocumentLibrarySort>(["newest", "oldest", "name", "expiry"]);
const allowedFocus = new Set<DocumentLibraryFocus>(["all", "attention", "resident", "internal", "archived"]);
const allowedLifecycle = new Set(["active", "unpublished", "archived"]);
const allowedVisibility = new Set(["internal", "resident_all", "resident_property", "resident_unit", "resident_lease"]);

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boundedText(value: string | null, maxLength: number) {
  return (value || "").trim().slice(0, maxLength);
}

export function parseDocumentLibraryQuery(input: string | URL) {
  const url = typeof input === "string" ? new URL(input) : input;
  const params = url.searchParams;
  const requestedSort = boundedText(params.get("sort"), 24) as DocumentLibrarySort;
  const requestedFocus = boundedText(params.get("focus"), 24) as DocumentLibraryFocus;
  const lifecycle = boundedText(params.get("lifecycle"), 40);
  const visibility = boundedText(params.get("visibility"), 40);

  return {
    page: boundedInt(params.get("page"), 1, 1, 100_000),
    pageSize: boundedInt(params.get("pageSize"), DOCUMENT_LIBRARY_PAGE_SIZE, 10, DOCUMENT_LIBRARY_MAX_PAGE_SIZE),
    search: boundedText(params.get("search"), 200),
    category: boundedText(params.get("category"), 80),
    propertyId: boundedText(params.get("propertyId"), 100),
    visibility: allowedVisibility.has(visibility) ? visibility : "",
    lifecycle: allowedLifecycle.has(lifecycle) ? lifecycle : "",
    sort: allowedSorts.has(requestedSort) ? requestedSort : "newest" as DocumentLibrarySort,
    focus: allowedFocus.has(requestedFocus) ? requestedFocus : "all" as DocumentLibraryFocus,
  };
}
