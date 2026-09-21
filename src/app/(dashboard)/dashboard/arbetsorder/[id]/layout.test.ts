import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order detail layout staff scope", () => {
  it("requires staff before loading the work order or enterprise state", () => {
    const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(source).toContain("requireCompanyUser");
    expect(source.indexOf("requireCompanyUser")).toBeLessThan(source.indexOf("workOrder.findFirst"));
    expect(source.indexOf("requireCompanyUser")).toBeLessThan(source.indexOf("getWorkOrderEnterpriseState"));
    expect(source).toContain("if (!user) notFound()");
  });
});
