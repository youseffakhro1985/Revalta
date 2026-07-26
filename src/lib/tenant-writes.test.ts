import { describe, expect, it } from "vitest";
import { deleteOwnedByCompany, updateOwnedByCompany } from "./tenant-writes";

describe("tenant-writes", () => {
  it("avvisar okända modeller innan databasanslutning", async () => {
    await expect(
      updateOwnedByCompany("notARealModel", {
        id: "id",
        companyId: "company",
        data: { name: "x" },
      }),
    ).rejects.toThrow(/Okänd modell/);

    await expect(
      deleteOwnedByCompany("notARealModel", {
        id: "id",
        companyId: "company",
      }),
    ).rejects.toThrow(/Okänd modell/);
  });
});
