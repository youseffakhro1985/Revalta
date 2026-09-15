import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician next-order time form", () => {
  it("posts a time execution entry on the existing work-order route", () => {
    const source = readFileSync(new URL("./technician-next-order-time-form.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/${workOrderId}/execution");
    expect(source).toContain('action: "entry.create"');
    expect(source).toContain('entryType: "time"');
    expect(source).toContain("router.refresh()");
    expect(source).not.toContain("completion.finalize");
    expect(source).not.toContain("Slutför");
  });
});
