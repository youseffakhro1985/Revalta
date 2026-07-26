import { describe, expect, it } from "vitest";
import {
  OPERATIONS_STATUS_LABELS,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  priorityLabel,
  ticketStatusLabel,
  workOrderStatusLabel,
} from "./domain-labels";

describe("domain-labels", () => {
  it("exponerar svenska ticket- och prioritetsetiketter", () => {
    expect(TICKET_STATUS_LABELS.received).toBe("Mottagen");
    expect(PRIORITY_LABELS.urgent).toBe("Akut");
    expect(ticketStatusLabel("waiting")).toBe("Väntar");
    expect(priorityLabel("high")).toBe("Hög");
  });

  it("återanvänder arbetsorderetiketter och legacy-alias", () => {
    expect(WORK_ORDER_STATUS_LABELS.waiting_material).toBe("Väntar material");
    expect(OPERATIONS_STATUS_LABELS.assigned).toBe("Tilldelad");
    expect(workOrderStatusLabel("invoiced")).toBe("Fakturerad");
    expect(ticketStatusLabel("unknown-status")).toBe("unknown-status");
  });
});
