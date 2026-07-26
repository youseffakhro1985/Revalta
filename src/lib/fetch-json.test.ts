import { describe, expect, it } from "vitest";
import { readResponseJson } from "@/lib/fetch-json";

describe("readResponseJson", () => {
  it("parses JSON bodies", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readResponseJson(response)).resolves.toEqual({ ok: true });
  });

  it("returns empty object for empty bodies instead of Safari pattern errors", async () => {
    const response = new Response("", { status: 500 });
    await expect(readResponseJson(response)).resolves.toEqual({});
  });

  it("throws a Swedish error for invalid JSON", async () => {
    const response = new Response("<html>nope</html>", { status: 500 });
    await expect(readResponseJson(response)).rejects.toThrow(/Ogiltigt JSON/);
  });
});
