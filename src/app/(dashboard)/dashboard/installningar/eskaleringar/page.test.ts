import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("eskaleringar hash targets", () => {
  it("keeps regler, driftkontroll and historik in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="regler"');
    expect(source).toContain('id="driftkontroll"');
    expect(source).toContain('id="historik"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#regler"');
    expect(source).toContain('hash !== "#driftkontroll"');
    expect(source).toContain('hash !== "#historik"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#regler"');
    expect(source).toContain('href="#driftkontroll"');
    expect(source).toContain('href="#historik"');
  });
});

describe("eskaleringar assignment filter first HTML", () => {
  it("keeps the assignment filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#eskfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Hantera regler");
    expect(source).not.toContain("{loading && !data ? <div className=\"h-52 animate-pulse rounded-xl bg-sand-100\" /> : null}");
    expect(source).not.toContain("<div className=\"h-24 animate-pulse rounded-xl bg-sand-100\" />");
  });
});

describe("eskaleringar leftover assignments first HTML", () => {
  it("keeps leftover assignments in the first HTML without stealing Hantera regler or filters", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskaleringslista"');
    expect(source).toContain('window.location.hash !== "#eskaleringslista"');
    expect(source).toContain("Eskaleringsuppgifterna hämtas.");
    expect(source).toContain('id="eskfilter"');
    expect(source).toContain('id="regler"');
    expect(source).toContain("Hantera regler");
    expect(source).toContain("/dashboard/installningar/eskaleringar/regler");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("autoFocus");
  });
});

describe("eskaleringar recipient filter first HTML", () => {
  it("keeps the recipient role filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="mottagarfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#mottagarfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Hantera regler");
    expect(source).not.toContain("{loading && !data ? <div className=\"h-40 animate-pulse rounded-xl bg-sand-100\" /> : null}");
  });
});

describe("eskaleringar leftover recipients first HTML", () => {
  it("keeps leftover recipients in the first HTML without stealing Hantera regler or filters", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskmottagarlista"');
    expect(source).toContain('window.location.hash !== "#eskmottagarlista"');
    expect(source).toContain("Mottagarna hämtas.");
    expect(source).toContain('id="mottagarfilter"');
    expect(source).toContain('id="eskaleringslista"');
    expect(source).toContain("Hantera regler");
    expect(source).not.toContain('id="mottagarlista"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("autoFocus");
  });
});

describe("eskaleringar leftover rules first HTML", () => {
  it("keeps leftover rules in the first HTML without stealing Hantera regler", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="regellista"');
    expect(source).toContain('window.location.hash !== "#regellista"');
    expect(source).toContain("Reglerna hämtas.");
    expect(source).toContain('id="regler"');
    expect(source).toContain("Hantera regler");
    expect(source).toContain("/dashboard/installningar/eskaleringar/regler");
    expect(source).toContain("scrollIntoView");
    const leftoverIndex = source.indexOf('id="regellista"');
    const stickyIndex = source.indexOf("Hantera regler");
    expect(leftoverIndex).toBeGreaterThan(-1);
    expect(stickyIndex).toBeGreaterThan(leftoverIndex);
  });
});

describe("eskaleringar leftover history first HTML", () => {
  it("keeps leftover history in the first HTML without stealing Hantera regler or #historik", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskhistoriklista"');
    expect(source).toContain('window.location.hash !== "#eskhistoriklista"');
    expect(source).toContain("Historiken hämtas.");
    expect(source).toContain('id="historik"');
    expect(source).toContain("Hantera regler");
    expect(source).not.toContain('id="aktivitetsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("/dashboard/installningar/eskaleringar/regler");
  });
});
