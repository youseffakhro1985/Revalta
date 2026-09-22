import { describe, expect, it } from "vitest";
import {
  sanitizeWorkOrderNotesArgs,
  workOrderNotesWrite,
  workOrderScalarSelectWithoutNotes,
} from "@/lib/work-order-notes-compat";

describe("work-order notes compat", () => {
  it("omits notes from create payloads when the column is missing", () => {
    expect(workOrderNotesWrite(false, "Planera åtgärd")).toEqual({});
    expect(workOrderNotesWrite(true, "Planera åtgärd")).toEqual({ notes: "Planera åtgärd" });
    expect(workOrderNotesWrite(true, null)).toEqual({});
  });

  it("selects WorkOrder scalars without notes instead of using preview omitApi", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "WorkOrder",
      "create",
      { data: { title: "Läckage", notes: "Planera åtgärd" } },
    ) as { data: { title: string }; select: Record<string, true> };
    expect(sanitized.data).toEqual({ title: "Läckage" });
    expect(sanitized).not.toHaveProperty("omit");
    expect(sanitized.select.id).toBe(true);
    expect(sanitized.select.title).toBe(true);
    expect(sanitized.select).not.toHaveProperty("notes");
    expect(workOrderScalarSelectWithoutNotes()).not.toHaveProperty("notes");
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

  it("converts include to a notes-free select on WorkOrder reads", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "WorkOrder",
      "findFirst",
      { where: { id: "work-order-1" }, include: { ticket: { select: { id: true } } } },
    ) as { where: { id: string }; select: Record<string, unknown> };
    expect(sanitized.where).toEqual({ id: "work-order-1" });
    expect(sanitized).not.toHaveProperty("include");
    expect(sanitized).not.toHaveProperty("omit");
    expect(sanitized.select.ticket).toEqual({ select: { id: true } });
    expect(sanitized.select.id).toBe(true);
    expect(sanitized.select).not.toHaveProperty("notes");
  });

  it("selects nested Ticket.work_order without notes", async () => {
    const client = {
      $queryRaw: async () => [],
    };
    const sanitized = await sanitizeWorkOrderNotesArgs(
      client as never,
      "Ticket",
      "findFirst",
      { where: { id: "ticket-1" }, include: { work_order: true } },
    ) as { include: { work_order: { select: Record<string, true> } } };
    expect(sanitized.include.work_order.select.id).toBe(true);
    expect(sanitized.include.work_order.select).not.toHaveProperty("notes");
  });
});
