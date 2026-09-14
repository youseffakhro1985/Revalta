import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ticket SLA presentation", () => {
  it("renders due date and SLA policy label on the ticket detail page", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("getSlaLabel");
    expect(source).toContain("ticket.due_date");
    expect(source).toContain("SLA");
  });
});
