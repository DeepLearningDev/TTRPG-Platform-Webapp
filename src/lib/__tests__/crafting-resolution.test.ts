import { describe, expect, it } from "vitest";
import {
  CraftingResolutionOutcome,
  HoldingScope,
  LootRarity,
} from "@prisma/client";
import {
  buildCraftingConsumptionPlan,
  deriveCraftingHoldings,
  parseCraftingMaterials,
  resolveCraftingOutcome,
  summarizeCraftingMaterials,
} from "@/lib/crafting-resolution";

describe("parseCraftingMaterials", () => {
  it("parses lightweight quantity-prefixed material text", () => {
    expect(parseCraftingMaterials("2x Leather, silver thread\n3 ward chalk")).toEqual([
      {
        key: "leather",
        name: "Leather",
        quantity: 2,
      },
      {
        key: "silver thread",
        name: "silver thread",
        quantity: 1,
      },
      {
        key: "ward chalk",
        name: "ward chalk",
        quantity: 3,
      },
    ]);
  });
});

describe("deriveCraftingHoldings", () => {
  it("keeps only positive per-scope item balances", () => {
    const holdings = deriveCraftingHoldings([
      {
        scope: HoldingScope.INVENTORY,
        quantity: 2,
        lootItem: {
          id: "leather",
          name: "Leather",
        },
      },
      {
        scope: HoldingScope.INVENTORY,
        quantity: -1,
        lootItem: {
          id: "leather",
          name: "Leather",
        },
      },
      {
        scope: HoldingScope.BANK,
        quantity: 3,
        lootItem: {
          id: "thread",
          name: "Silver Thread",
        },
      },
    ]);

    expect(holdings).toEqual([
      {
        lootItemId: "leather",
        key: "leather",
        name: "Leather",
        quantity: 1,
        scope: HoldingScope.INVENTORY,
      },
      {
        lootItemId: "thread",
        key: "silver thread",
        name: "Silver Thread",
        quantity: 3,
        scope: HoldingScope.BANK,
      },
    ]);
  });
});

describe("summarizeCraftingMaterials", () => {
  it("reports met and missing material totals", () => {
    const summary = summarizeCraftingMaterials(
      parseCraftingMaterials("2x Leather, 1x Silver Thread"),
      [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 2,
          scope: HoldingScope.INVENTORY,
        },
      ],
    );

    expect(summary.isMet).toBe(false);
    expect(summary.missing).toEqual(["Silver Thread (0/1)"]);
  });
});

describe("buildCraftingConsumptionPlan", () => {
  it("prefers inventory before bank when consuming materials", () => {
    const plan = buildCraftingConsumptionPlan(
      parseCraftingMaterials("2x Leather"),
      [
        {
          lootItemId: "inv-leather",
          key: "leather",
          name: "Leather",
          quantity: 1,
          scope: HoldingScope.INVENTORY,
        },
        {
          lootItemId: "bank-leather",
          key: "leather",
          name: "Leather",
          quantity: 2,
          scope: HoldingScope.BANK,
        },
      ],
      "full",
    );

    expect(plan.isMet).toBe(true);
    expect(plan.consumption).toEqual([
      {
        lootItemId: "inv-leather",
        key: "leather",
        name: "Leather",
        quantity: 1,
        scope: HoldingScope.INVENTORY,
      },
      {
        lootItemId: "bank-leather",
        key: "leather",
        name: "Leather",
        quantity: 1,
        scope: HoldingScope.BANK,
      },
    ]);
  });
});

describe("resolveCraftingOutcome", () => {
  it("returns success, mixed, and failure bands", () => {
    expect(
      resolveCraftingOutcome({
        level: 8,
        rarity: LootRarity.UNCOMMON,
        outputName: "Runed Satchel",
        dieRoll: 18,
      }).outcome,
    ).toBe(CraftingResolutionOutcome.SUCCESS);

    expect(
      resolveCraftingOutcome({
        level: 8,
        rarity: LootRarity.UNCOMMON,
        outputName: "Runed Satchel",
        dieRoll: 10,
      }).outcome,
    ).toBe(CraftingResolutionOutcome.MIXED);

    expect(
      resolveCraftingOutcome({
        level: 1,
        rarity: LootRarity.RARE,
        outputName: "Runed Satchel",
        dieRoll: 3,
      }).outcome,
    ).toBe(CraftingResolutionOutcome.FAILURE);
  });
});
