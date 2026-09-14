import { describe, expect, it } from "vitest";
import {
  unmatchedInboundSmsCount,
  withUnmatchedInboundSmsFirst,
} from "@/lib/integration-event-list";

describe("integration event list", () => {
  it("counts unmatched inbound SMS", () => {
    expect(unmatchedInboundSmsCount([
      { type: "sms", status: "received" },
      { type: "sms", status: "unmatched" },
      { type: "email", status: "unmatched" },
      { type: "sms", status: "unmatched" },
    ])).toBe(2);
  });

  it("keeps unmatched inbound SMS at the top of the feed", () => {
    const ordered = withUnmatchedInboundSmsFirst([
      { type: "email", status: "sent" },
      { type: "sms", status: "unmatched" },
      { type: "sms", status: "received" },
    ]);
    expect(ordered.map((event) => `${event.type}:${event.status}`)).toEqual([
      "sms:unmatched",
      "email:sent",
      "sms:received",
    ]);
  });
});
