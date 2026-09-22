import { describe, expect, it } from "vitest";
import { sanitizeWorkOrderNotesArgs, workOrderNotesWrite } from "@/lib/work-order-notes-compat";

describe("work-order notes compat", () => {
  it("omits notes from create payloads when the column is missing", () => {
    expect(workOrderNotesWrite(false, "Planera åtgärd")).toEqual({});
    expect(workOrderNotesWrite(true, "Planera åtgärd")).toEqual({ notes: "Planera åtgärd" });
    expect(workOrderNotesWrite(true, null)).toEqual({});
  });

  it("adds omit.notes and strips data.notes when the column is missing", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "WorkOrder",
      "create",
      { data: { title: "Läckage", notes: "Planera åtgärd" } },
    );
    expect(sanitized).toEqual({
      data: { title: "Läckage" },
      omit: { notes: true },
    });
  });

  it("keeps an explicit select and only strips data.notes", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "WorkOrder",
      "create",
      { data: { title: "Läckage", notes: "Planera åtgärd" }, select: { id: true } },
    );
    expect(sanitized).toEqual({
      data: { title: "Läckage" },
      select: { id: true },
    });
  });

  it("omits notes on nested Ticket.work_order includes", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "Ticket",
      "findFirst",
      { where: { id: "ticket-1" }, include: { work_order: true } },
    );
    expect(sanitized).toEqual({
      where: { id: "ticket-1" },
      include: { work_order: { omit: { notes: true } } },
    });
  });
});
