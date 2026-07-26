import { describe, expect, it } from "vitest";
import { asNumber, isModernStorageMirror, mergeByCreatedAt, parseDateOnly, parseOptionalDate } from "./dual-list";

describe("dual-list helpers", () => {
  it("mergeByCreatedAt prioriterar moderna rader och sorterar nyast först", () => {
    const modern = [{ id: "a", created_at: new Date("2026-07-20T10:00:00.000Z") }];
    const legacy = [
      { id: "a", created_at: new Date("2026-07-19T10:00:00.000Z") },
      { id: "b", created_at: new Date("2026-07-21T10:00:00.000Z") },
    ];
    expect(mergeByCreatedAt(modern, legacy, 10).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("mergeByCreatedAt hoppar över legacy med samma id som modern", () => {
    const modern = [{ id: "entry-1", created_at: new Date("2026-07-20T10:00:00.000Z") }];
    const legacy = [
      { id: "entry-1", created_at: new Date("2026-07-21T10:00:00.000Z"), storage: "BudgetEntry" },
      { id: "legacy-2", created_at: new Date("2026-07-19T10:00:00.000Z") },
    ];
    expect(mergeByCreatedAt(modern, legacy, 10).map((row) => row.id)).toEqual(["entry-1", "legacy-2"]);
  });

  it("mergeByCreatedAt hoppar över metadata.storage-speglar", () => {
    const modern = [{ id: "entry-1", created_at: new Date("2026-07-20T10:00:00.000Z") }];
    const legacy = [
      { id: "audit-1", created_at: new Date("2026-07-21T10:00:00.000Z"), storage: "BudgetEntry" },
      { id: "legacy-2", created_at: new Date("2026-07-19T10:00:00.000Z") },
    ];
    expect(
      mergeByCreatedAt(modern, legacy, 10, { modernStorage: "BudgetEntry" }).map((row) => row.id),
    ).toEqual(["entry-1", "legacy-2"]);
  });

  it("mergeByCreatedAt hoppar över entity_id som finns i modernIds", () => {
    const modern = [{ id: "entry-1", created_at: new Date("2026-07-20T10:00:00.000Z") }];
    const legacy = [
      { id: "audit-1", created_at: new Date("2026-07-21T10:00:00.000Z"), entityId: "entry-1" },
      { id: "legacy-2", created_at: new Date("2026-07-19T10:00:00.000Z"), entityId: "other" },
    ];
    expect(
      mergeByCreatedAt(modern, legacy, 10, {
        legacyEntityId: (row) => row.entityId,
      }).map((row) => row.id),
    ).toEqual(["entry-1", "legacy-2"]);
  });

  it("isModernStorageMirror hoppar över samma id via entity_id", () => {
    const modernIds = new Set(["entry-1"]);
    expect(isModernStorageMirror({}, "BudgetEntry", modernIds, "entry-1")).toBe(true);
    expect(isModernStorageMirror({}, "BudgetEntry", modernIds, "legacy-2")).toBe(false);
  });

  it("isModernStorageMirror hoppar över metadata.storage-speglar", () => {
    const modernIds = new Set<string>();
    expect(isModernStorageMirror({ storage: "BudgetEntry" }, "BudgetEntry", modernIds)).toBe(true);
    expect(isModernStorageMirror({ storage: "Other" }, "BudgetEntry", modernIds)).toBe(false);
  });

  it("parsar datum och tal säkert", () => {
    expect(asNumber("12.5")).toBe(12.5);
    expect(parseDateOnly("2026-07-26")?.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(parseDateOnly("26/07/2026")).toBeNull();
    expect(parseOptionalDate("2026-07-26T12:00:00.000Z")).toBeInstanceOf(Date);
  });
});
