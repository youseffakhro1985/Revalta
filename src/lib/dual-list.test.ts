import { describe, expect, it } from "vitest";
import { asNumber, mergeByCreatedAt, parseDateOnly, parseOptionalDate } from "./dual-list";

describe("dual-list helpers", () => {
  it("mergeByCreatedAt prioriterar moderna rader och sorterar nyast först", () => {
    const modern = [{ id: "a", created_at: new Date("2026-07-20T10:00:00.000Z") }];
    const legacy = [
      { id: "a", created_at: new Date("2026-07-19T10:00:00.000Z") },
      { id: "b", created_at: new Date("2026-07-21T10:00:00.000Z") },
    ];
    expect(mergeByCreatedAt(modern, legacy, 10).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("parsar datum och tal säkert", () => {
    expect(asNumber("12.5")).toBe(12.5);
    expect(parseDateOnly("2026-07-26")?.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(parseDateOnly("26/07/2026")).toBeNull();
    expect(parseOptionalDate("2026-07-26T12:00:00.000Z")).toBeInstanceOf(Date);
  });
});
