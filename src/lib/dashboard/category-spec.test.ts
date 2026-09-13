import { describe, expect, it } from "vitest";
import { CATEGORY_CATALOG, categoryFunctions, categorySpec, getCategoryMeta, knownCategoryIds } from "./category-spec";

describe("category spec catalog", () => {
  it("covers every staff category with module, route, plane, api and functions", () => {
    const ids = knownCategoryIds();
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      const meta = CATEGORY_CATALOG[id];
      expect(meta.module.length).toBeGreaterThan(2);
      expect(meta.route.startsWith("/dashboard")).toBe(true);
      expect(meta.plane.length).toBeGreaterThan(4);
      expect(meta.api.length).toBeGreaterThan(4);
      expect(meta.functions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("builds a technical spec with optional live record counts", () => {
    expect(categorySpec("arenden").map((item) => item.label)).toEqual(["Modul", "Yta", "Dataplan", "API"]);
    expect(categorySpec("arenden", { records: "128" }).at(-1)).toEqual({ label: "Poster", value: "128" });
    expect(categoryFunctions("arbetsorder")).toContain("SLA");
  });

  it("falls back safely for unknown catalog ids", () => {
    expect(getCategoryMeta("saknas").module).toBe("Revalta");
    expect(categorySpec("saknas")[0]?.label).toBe("Modul");
  });
});
