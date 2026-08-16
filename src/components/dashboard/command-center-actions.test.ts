import { describe, expect, it } from "vitest";
import { commandCenterQuickActions } from "@/components/dashboard/command-center-actions";

describe("command center quick actions", () => {
  it("ger owner alla skapande snabbåtgärder", () => {
    expect(commandCenterQuickActions("owner").map((item) => item.id)).toEqual([
      "new-work-order",
      "new-ticket",
      "new-property",
      "invite-team",
    ]);
  });

  it("ger technician endast operativa skapande åtgärder", () => {
    expect(commandCenterQuickActions("technician").map((item) => item.id)).toEqual([
      "new-work-order",
      "new-ticket",
    ]);
  });

  it("ger viewer inga mutationer", () => {
    expect(commandCenterQuickActions("viewer")).toEqual([]);
  });
});
