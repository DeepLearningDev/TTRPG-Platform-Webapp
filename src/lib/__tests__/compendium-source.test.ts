import { describe, expect, it } from "vitest";
import { estimateGoldValue, clampImportBudget } from "@/lib/compendium-source";
import { LootRarity } from "@prisma/client";

describe("compendium-source", () => {
  it("clamps import budgets to the safe page limits", () => {
    expect(
      clampImportBudget({
        pageSize: 99,
        pageLimit: 99,
      }),
    ).toEqual({
      pageSize: 10,
      pageLimit: 2,
    });
  });

  it("keeps normal import budgets intact", () => {
    expect(
      clampImportBudget({
        pageSize: 5,
        pageLimit: 1,
      }),
    ).toEqual({
      pageSize: 5,
      pageLimit: 1,
    });
  });

  it("maps rarity to a simple gold baseline", () => {
    expect(estimateGoldValue(LootRarity.RARE)).toBe(500);
  });
});
