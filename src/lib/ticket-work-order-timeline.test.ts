import { describe, expect, it } from "vitest";
import { buildTicketWorkOrderTimeline, workOrderStatusLabel } from "@/lib/ticket-work-order-timeline";

const createdAt = new Date("2026-07-20T08:00:00.000Z");

describe("ticket work-order timeline", () => {
  it("översätter arbetsorderstatus till svenska", () => {
    expect(workOrderStatusLabel("waiting_material")).toBe("Väntar på material");
    expect(workOrderStatusLabel("completed")).toBe("Slutförd");
    expect(workOrderStatusLabel("custom_status")).toBe("custom_status");
  });

  it("bygger skapande och statushändelser med referens, aktör och länk", () => {
    const items = buildTicketWorkOrderTimeline(
      {
        id: "work-order-12345678",
        title: "Läckande kran",
        workOrderNumber: "AO-2026-000123",
        createdAt,
        assignedTo: { name: "Anna Andersson", email: "anna@example.com" },
      },
      [
        {
          id: "event-1",
          from_status: "planned",
          to_status: "in_progress",
          reason: "Tekniker på plats",
          metadata: null,
          created_at: new Date("2026-07-20T09:00:00.000Z"),
          actor_user_id: "user-1",
          actor_name: "Erik Eriksson",
          actor_email: "erik@example.com",
        },
      ],
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: "work_order_created",
      title: "Arbetsorder AO-2026-000123 skapad",
      description: "Läckande kran · Ansvarig: Anna Andersson",
      href: "/dashboard/arbetsorder/work-order-12345678",
    });
    expect(items[1]).toMatchObject({
      type: "work_order_status",
      title: "Arbetsorder AO-2026-000123: Planerad → Pågår",
      description: "Erik Eriksson · Orsak: Tekniker på plats",
    });
  });
});
