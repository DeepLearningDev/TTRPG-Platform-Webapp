import { describe, expect, it } from "vitest";
import {
  CraftingJobStatus,
  CraftingResolutionOutcome,
  HoldingScope,
  LootKind,
  LootRarity,
} from "@prisma/client";
import {
  buildCraftingConsumptionPlan,
  deriveCraftingHoldings,
  parseCraftingMaterials,
  planCraftingCompletion,
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

  it("consumes only one staged unit of each required material on failure", () => {
    const plan = buildCraftingConsumptionPlan(
      parseCraftingMaterials("3x Leather, 2x Silver Thread"),
      [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 3,
          scope: HoldingScope.INVENTORY,
        },
        {
          lootItemId: "thread",
          key: "silver thread",
          name: "Silver Thread",
          quantity: 2,
          scope: HoldingScope.INVENTORY,
        },
      ],
      "failure",
    );

    expect(plan.isMet).toBe(true);
    expect(plan.consumption).toEqual([
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
        quantity: 1,
        scope: HoldingScope.INVENTORY,
      },
    ]);
  });

  it("still prefers inventory before bank when consuming failure materials", () => {
    const plan = buildCraftingConsumptionPlan(
      parseCraftingMaterials("3x Leather"),
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
          quantity: 3,
          scope: HoldingScope.BANK,
        },
      ],
      "failure",
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

  it("resolves exact dc boundaries", () => {
    const baseInput = {
      level: 8,
      rarity: LootRarity.UNCOMMON,
      outputName: "Runed Satchel",
    };

    expect(resolveCraftingOutcome({ ...baseInput, dieRoll: 14 })).toMatchObject({
      dc: 12,
      skillBonus: 2,
      total: 16,
      outcome: CraftingResolutionOutcome.SUCCESS,
    });

    expect(resolveCraftingOutcome({ ...baseInput, dieRoll: 10 })).toMatchObject({
      dc: 12,
      skillBonus: 2,
      total: 12,
      outcome: CraftingResolutionOutcome.MIXED,
    });

    expect(resolveCraftingOutcome({ ...baseInput, dieRoll: 9 })).toMatchObject({
      dc: 12,
      skillBonus: 2,
      total: 11,
      outcome: CraftingResolutionOutcome.FAILURE,
    });
  });
});

describe("planCraftingCompletion", () => {
  const resolvedAt = new Date("2026-05-11T12:00:00.000Z");

  it("plans successful completion with full material consumption, output, and gold cost", () => {
    const plan = planCraftingCompletion({
      recipe: {
        outputName: "Runed Satchel",
        outputDescription: "A sturdy satchel traced with silver wards.",
        outputRarity: LootRarity.UNCOMMON,
        outputKind: LootKind.WONDROUS,
        goldCost: 25,
      },
      characterLevel: 8,
      requirements: parseCraftingMaterials("2x Leather, 1x Silver Thread"),
      holdings: [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 2,
          scope: HoldingScope.INVENTORY,
        },
        {
          lootItemId: "thread",
          key: "silver thread",
          name: "Silver Thread",
          quantity: 1,
          scope: HoldingScope.BANK,
        },
      ],
      destinationScope: HoldingScope.INVENTORY,
      dieRoll: 14,
      existingLootItemId: null,
      resolvedAt,
    });

    expect(plan.isMet).toBe(true);

    if (!plan.isMet) {
      return;
    }

    expect(plan.outcomeKey).toBe("success");
    expect(plan.consumptionEntries).toEqual([
      {
        lootItemId: "leather",
        key: "leather",
        name: "Leather",
        quantity: 2,
        scope: HoldingScope.INVENTORY,
        note: "Spent 2x Leather on Runed Satchel (success result)",
      },
      {
        lootItemId: "thread",
        key: "silver thread",
        name: "Silver Thread",
        quantity: 1,
        scope: HoldingScope.BANK,
        note: "Spent 1x Silver Thread on Runed Satchel (success result)",
      },
    ]);
    expect(plan.goldCostLedgerIntent).toEqual({
      scope: HoldingScope.BANK,
      goldDelta: -25,
      note: "Spent Runed Satchel crafting costs (success result)",
    });
    expect(plan.outputItemIntent).toEqual({
      existingLootItemId: null,
      createLootItem: {
        name: "Runed Satchel",
        rarity: LootRarity.UNCOMMON,
        kind: LootKind.WONDROUS,
        description: "A sturdy satchel traced with silver wards.",
        sourceTag: "Crafted item",
      },
      ledgerEntry: {
        scope: HoldingScope.INVENTORY,
        quantity: 1,
        note: "Crafted Runed Satchel",
      },
    });
    expect(plan.jobPatch).toEqual({
      status: CraftingJobStatus.COMPLETE,
      resolutionOutcome: CraftingResolutionOutcome.SUCCESS,
      resolutionText:
        "Roll 14 + 2 = 16 vs DC 12. Runed Satchel comes together cleanly. The full recipe is spent and the finished item is ready.",
      rollDie: 14,
      rollTotal: 16,
      resolvedAt,
    });
  });

  it("plans mixed completion output against an existing loot item", () => {
    const plan = planCraftingCompletion({
      recipe: {
        outputName: "Runed Satchel",
        outputDescription: "A sturdy satchel traced with silver wards.",
        outputRarity: LootRarity.UNCOMMON,
        outputKind: LootKind.WONDROUS,
        goldCost: 0,
      },
      characterLevel: 8,
      requirements: parseCraftingMaterials("1x Leather"),
      holdings: [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 1,
          scope: HoldingScope.INVENTORY,
        },
      ],
      destinationScope: HoldingScope.BANK,
      dieRoll: 10,
      existingLootItemId: "loot-runed-satchel",
      resolvedAt,
    });

    expect(plan.isMet).toBe(true);

    if (!plan.isMet) {
      return;
    }

    expect(plan.outcomeKey).toBe("mixed");
    expect(plan.goldCostLedgerIntent).toBeNull();
    expect(plan.outputItemIntent).toEqual({
      existingLootItemId: "loot-runed-satchel",
      createLootItem: null,
      ledgerEntry: {
        scope: HoldingScope.BANK,
        quantity: 1,
        note: "Crafted Runed Satchel with a mixed result",
      },
    });
    expect(plan.jobPatch).toMatchObject({
      resolutionOutcome: CraftingResolutionOutcome.MIXED,
      rollDie: 10,
      rollTotal: 12,
    });
  });

  it("plans failure with one-unit material consumption and no output", () => {
    const plan = planCraftingCompletion({
      recipe: {
        outputName: "Runed Satchel",
        outputDescription: "A sturdy satchel traced with silver wards.",
        outputRarity: LootRarity.RARE,
        outputKind: LootKind.WONDROUS,
        goldCost: 25,
      },
      characterLevel: 1,
      requirements: parseCraftingMaterials("3x Leather, 2x Silver Thread"),
      holdings: [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 3,
          scope: HoldingScope.INVENTORY,
        },
        {
          lootItemId: "thread",
          key: "silver thread",
          name: "Silver Thread",
          quantity: 2,
          scope: HoldingScope.INVENTORY,
        },
      ],
      destinationScope: HoldingScope.INVENTORY,
      dieRoll: 3,
      existingLootItemId: null,
      resolvedAt,
    });

    expect(plan.isMet).toBe(true);

    if (!plan.isMet) {
      return;
    }

    expect(plan.outcomeKey).toBe("failure");
    expect(plan.consumptionEntries).toEqual([
      {
        lootItemId: "leather",
        key: "leather",
        name: "Leather",
        quantity: 1,
        scope: HoldingScope.INVENTORY,
        note: "Spent 1x Leather on Runed Satchel (failure result)",
      },
      {
        lootItemId: "thread",
        key: "silver thread",
        name: "Silver Thread",
        quantity: 1,
        scope: HoldingScope.INVENTORY,
        note: "Spent 1x Silver Thread on Runed Satchel (failure result)",
      },
    ]);
    expect(plan.goldCostLedgerIntent).toBeNull();
    expect(plan.outputItemIntent).toBeNull();
    expect(plan.jobPatch).toMatchObject({
      resolutionOutcome: CraftingResolutionOutcome.FAILURE,
      rollDie: 3,
      rollTotal: 3,
      resolvedAt,
    });
  });
});
