import { describe, expect, it } from "vitest";
import { isModuleNavigationItemActive, type ModuleNavigationItem } from "@/components/dashboard/module-navigation";

function item(href: string, exact = false): ModuleNavigationItem {
  return { href, label: href, exact };
}

describe("module navigation active state", () => {
  it("markerar exakt rot endast när exact är satt", () => {
    const root = item("/dashboard/arbetsorder", true);
    expect(isModuleNavigationItemActive("/dashboard/arbetsorder", root)).toBe(true);
    expect(isModuleNavigationItemActive("/dashboard/arbetsorder/planering", root)).toBe(false);
  });

  it("markerar en modul och dess underroute när exact inte är satt", () => {
    const planning = item("/dashboard/arbetsorder/planering");
    expect(isModuleNavigationItemActive("/dashboard/arbetsorder/planering", planning)).toBe(true);
    expect(isModuleNavigationItemActive("/dashboard/arbetsorder/planering/vecka", planning)).toBe(true);
  });

  it("skiljer eskaleringar från eskaleringsregler", () => {
    const escalation = item("/dashboard/installningar/eskaleringar", true);
    const rules = item("/dashboard/installningar/eskaleringar/regler");
    expect(isModuleNavigationItemActive("/dashboard/installningar/eskaleringar/regler", escalation)).toBe(false);
    expect(isModuleNavigationItemActive("/dashboard/installningar/eskaleringar/regler", rules)).toBe(true);
  });

  it("matchar inte när två routes bara delar ett textprefix", () => {
    const itemA = item("/dashboard/drift");
    expect(isModuleNavigationItemActive("/dashboard/driftstatus", itemA)).toBe(false);
  });
});
