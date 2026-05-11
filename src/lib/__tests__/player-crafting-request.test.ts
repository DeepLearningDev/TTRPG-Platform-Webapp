import { HoldingScope } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { planPlayerCraftingRequest } from "@/lib/player-crafting-request";
import type { CraftingMaterialHolding } from "@/lib/crafting-resolution";

const readyHoldings: CraftingMaterialHolding[] = [
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
];

const activeRecipe = {
  id: "recipe-rune-satchel",
  status: "ACTIVE",
  name: "Runed Satchel",
  outputName: "Runed Satchel",
  materialsText: "2x Leather, 1x Silver Thread",
  goldCost: 25,
};

describe("planPlayerCraftingRequest", () => {
  it("returns an in-progress job intent when recipe, materials, and gold are ready", () => {
    const plan = planPlayerCraftingRequest({
      recipe: activeRecipe,
      craftingMaterialHoldings: readyHoldings,
      currentBankCopperBalance: 25,
      requestedNotes: "  Please craft this before the next delve.  ",
    });

    expect(plan).toEqual({
      ok: true,
      jobIntent: {
        recipeId: "recipe-rune-satchel",
        status: "IN_PROGRESS",
        notes: "Please craft this before the next delve.",
      },
      outputLabel: "Runed Satchel",
      recipeLabel: "Runed Satchel",
      materialSummary: {
        isMet: true,
        missing: [],
        materials: [
          {
            key: "leather",
            name: "Leather",
            required: 2,
            available: 2,
            isMet: true,
          },
          {
            key: "silver thread",
            name: "Silver Thread",
            required: 1,
            available: 1,
            isMet: true,
          },
        ],
      },
      goldSummary: {
        required: 25,
        available: 25,
        isMet: true,
      },
    });
  });

  it("rejects archived, missing, or malformed recipe state", () => {
    expect(
      planPlayerCraftingRequest({
        recipe: {
          ...activeRecipe,
          status: "ARCHIVED",
        },
        craftingMaterialHoldings: readyHoldings,
        currentBankCopperBalance: 25,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-crafting-state",
    });

    expect(
      planPlayerCraftingRequest({
        recipe: null,
        craftingMaterialHoldings: readyHoldings,
        currentBankCopperBalance: 25,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-crafting-state",
    });

    expect(
      planPlayerCraftingRequest({
        recipe: {
          ...activeRecipe,
          materialsText: "   ",
        },
        craftingMaterialHoldings: readyHoldings,
        currentBankCopperBalance: 25,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-crafting-state",
    });
  });

  it("rejects insufficient crafting materials with the material summary", () => {
    const plan = planPlayerCraftingRequest({
      recipe: activeRecipe,
      craftingMaterialHoldings: [
        {
          lootItemId: "leather",
          key: "leather",
          name: "Leather",
          quantity: 1,
          scope: HoldingScope.INVENTORY,
        },
      ],
      currentBankCopperBalance: 25,
    });

    expect(plan).toEqual({
      ok: false,
      reason: "insufficient-crafting-materials",
      materialSummary: {
        isMet: false,
        missing: ["Leather (1/2)", "Silver Thread (0/1)"],
        materials: [
          {
            key: "leather",
            name: "Leather",
            required: 2,
            available: 1,
            isMet: false,
          },
          {
            key: "silver thread",
            name: "Silver Thread",
            required: 1,
            available: 0,
            isMet: false,
          },
        ],
      },
      goldSummary: {
        required: 25,
        available: 25,
        isMet: true,
      },
    });
  });

  it("rejects insufficient player gold after material readiness is met", () => {
    const plan = planPlayerCraftingRequest({
      recipe: activeRecipe,
      craftingMaterialHoldings: readyHoldings,
      currentBankCopperBalance: 24,
      requestedNotes: "   ",
    });

    expect(plan).toEqual({
      ok: false,
      reason: "insufficient-player-gold",
      materialSummary: {
        isMet: true,
        missing: [],
        materials: [
          {
            key: "leather",
            name: "Leather",
            required: 2,
            available: 2,
            isMet: true,
          },
          {
            key: "silver thread",
            name: "Silver Thread",
            required: 1,
            available: 1,
            isMet: true,
          },
        ],
      },
      goldSummary: {
        required: 25,
        available: 24,
        isMet: false,
      },
    });
  });
});
