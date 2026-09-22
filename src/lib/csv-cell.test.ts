import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv-cell";

describe("csvCell", () => {
  it("quotes ordinary text and doubles embedded quotes", () => {
    expect(csvCell("Storgatan 1")).toBe('"Storgatan 1"');
    expect(csvCell('Sade "hej"')).toBe('"Sade ""hej"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });

  it("prefixes Tenant B-shaped spreadsheet formulas so they cannot execute", () => {
    expect(csvCell("=CMD(TenantB)")).toBe("\"'=CMD(TenantB)\"");
    expect(csvCell("+Hyra")).toBe("\"'+Hyra\"");
    expect(csvCell("-SUM(A1)")).toBe("\"'-SUM(A1)\"");
    expect(csvCell("@cmd")).toBe("\"'@cmd\"");
    expect(csvCell("\t=1+1")).toBe("\"'\t=1+1\"");
    expect(csvCell("title")).toBe('"title"');
  });
});

describe("csvRow", () => {
  it("joins formula-safe cells with semicolon", () => {
    expect(csvRow(["Storgatan", "=CMD(TenantB)", "+Hyra"])).toBe(
      "\"Storgatan\";\"'=CMD(TenantB)\";\"'+Hyra\"",
    );
  });
});
