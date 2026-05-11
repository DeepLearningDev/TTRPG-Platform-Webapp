import {
  parseCraftingMaterials,
  summarizeCraftingMaterials,
  type CraftingMaterialHolding,
} from "@/lib/crafting-resolution";

export type PlayerCraftingRequestRecipe = {
  id: string | null;
  status: string;
  name: string;
  outputName: string;
  materialsText: string;
  goldCost: number;
};

export type PlayerCraftingRequestGoldSummary = {
  required: number;
  available: number;
  isMet: boolean;
};

export type PlayerCraftingRequestMaterialSummary = ReturnType<
  typeof summarizeCraftingMaterials
>;

export type PlayerCraftingRequestPlan =
  | {
      ok: true;
      jobIntent: {
        recipeId: string;
        status: "IN_PROGRESS";
        notes: string | null;
      };
      outputLabel: string;
      recipeLabel: string;
      materialSummary: PlayerCraftingRequestMaterialSummary;
      goldSummary: PlayerCraftingRequestGoldSummary;
    }
  | {
      ok: false;
      reason:
        | "invalid-player-crafting-state"
        | "insufficient-crafting-materials"
        | "insufficient-player-gold";
      materialSummary?: PlayerCraftingRequestMaterialSummary;
      goldSummary?: PlayerCraftingRequestGoldSummary;
    };

function normalizeRequestedNotes(value: string | null | undefined) {
  const notes = value?.trim();

  return notes ? notes : null;
}

function isValidCurrencyAmount(value: number) {
  return Number.isInteger(value) && value >= 0;
}

export function planPlayerCraftingRequest(input: {
  recipe: PlayerCraftingRequestRecipe | null;
  craftingMaterialHoldings: CraftingMaterialHolding[];
  currentBankCopperBalance: number;
  requestedNotes?: string | null;
}): PlayerCraftingRequestPlan {
  if (
    !input.recipe ||
    !input.recipe.id?.trim() ||
    input.recipe.status !== "ACTIVE" ||
    !isValidCurrencyAmount(input.recipe.goldCost) ||
    !isValidCurrencyAmount(input.currentBankCopperBalance)
  ) {
    return {
      ok: false,
      reason: "invalid-player-crafting-state",
    };
  }

  const requirements = parseCraftingMaterials(input.recipe.materialsText);

  if (requirements.length === 0) {
    return {
      ok: false,
      reason: "invalid-player-crafting-state",
    };
  }

  const materialSummary = summarizeCraftingMaterials(
    requirements,
    input.craftingMaterialHoldings,
  );
  const goldSummary = {
    required: input.recipe.goldCost,
    available: input.currentBankCopperBalance,
    isMet: input.currentBankCopperBalance >= input.recipe.goldCost,
  };

  if (!materialSummary.isMet) {
    return {
      ok: false,
      reason: "insufficient-crafting-materials",
      materialSummary,
      goldSummary,
    };
  }

  if (!goldSummary.isMet) {
    return {
      ok: false,
      reason: "insufficient-player-gold",
      materialSummary,
      goldSummary,
    };
  }

  return {
    ok: true,
    jobIntent: {
      recipeId: input.recipe.id,
      status: "IN_PROGRESS",
      notes: normalizeRequestedNotes(input.requestedNotes),
    },
    outputLabel: input.recipe.outputName,
    recipeLabel: input.recipe.name,
    materialSummary,
    goldSummary,
  };
}
