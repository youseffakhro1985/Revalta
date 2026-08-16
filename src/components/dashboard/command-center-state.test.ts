import { describe, expect, it } from "vitest";
import {
  addCommandCenterRecent,
  commandCenterStorageKey,
  isCommandCenterFavorite,
  parseCommandCenterState,
  sanitizeCommandCenterObject,
  toggleCommandCenterFavorite,
  type CommandCenterObject,
} from "@/components/dashboard/command-center-state";

const property: CommandCenterObject = {
  id: "property-1",
  type: "property",
  title: "Kvarteret Eken 7",
  subtitle: "Storgatan 7, Göteborg",
  href: "/dashboard/fastigheter/property-1",
};

describe("command center state", () => {
  it("namespacar state med opaque user id", () => {
    expect(commandCenterStorageKey("user-a")).toBe("revalta.command-center.v1:user-a");
    expect(commandCenterStorageKey("user-a")).not.toBe(commandCenterStorageKey("user-b"));
  });

  it("ignorerar manipulerade externa länkar och okända typer", () => {
    expect(sanitizeCommandCenterObject({ ...property, href: "https://evil.example" })).toBeNull();
    expect(sanitizeCommandCenterObject({ ...property, type: "secret" })).toBeNull();
  });

  it("läser endast säkra och unika favoriter/senaste", () => {
    const parsed = parseCommandCenterState(JSON.stringify({
      favorites: [property, property, { ...property, href: "javascript:alert(1)" }],
      recents: [property],
    }));
    expect(parsed.favorites).toEqual([property]);
    expect(parsed.recents).toEqual([property]);
  });

  it("flyttar senaste objekt överst utan dubbletter", () => {
    const other: CommandCenterObject = { ...property, id: "property-2", title: "Eken 8", href: "/dashboard/fastigheter/property-2" };
    const first = addCommandCenterRecent({ favorites: [], recents: [other] }, property);
    const second = addCommandCenterRecent(first, other);
    expect(second.recents.map((item) => item.id)).toEqual(["property-2", "property-1"]);
  });

  it("kan lägga till och ta bort favorit", () => {
    const added = toggleCommandCenterFavorite({ favorites: [], recents: [] }, property);
    expect(isCommandCenterFavorite(added, property)).toBe(true);
    const removed = toggleCommandCenterFavorite(added, property);
    expect(isCommandCenterFavorite(removed, property)).toBe(false);
  });
});
