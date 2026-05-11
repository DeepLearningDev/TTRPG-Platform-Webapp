import type { ShopType } from "@/lib/storefront-economy";
import {
  scoreStorefrontItemFit,
  suggestPlayerSellPrice,
} from "@/lib/storefront-economy";

export type PlayerStorefrontSaleRequestScope = "BANK" | "INVENTORY";

export type PlayerStorefrontSaleRequestStorefront = {
  id: string;
  shopType: ShopType;
  cashOnHand: number;
};

export type PlayerStorefrontSaleRequestLootItem = {
  id: string;
  kind: string;
  rarity: string;
  name: string;
  description?: string | null;
  sourceTag?: string | null;
  goldValue?: number | null;
};

export type PlayerStorefrontSaleRequestPlan =
  | {
      ok: true;
      requestIntent: {
        storefrontId: string;
        lootItemId: string;
        sellScope: PlayerStorefrontSaleRequestScope;
        quantity: number;
        suggestedPriceGold: number;
        fitScore: number;
        note: string;
      };
    }
  | {
      ok: false;
      reason: "invalid-player-storefront-state";
    };

function isNonEmptyText(value: string) {
  return value.trim().length > 0;
}

function isValidCopperAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidPositiveQuantity(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function planPlayerStorefrontSaleRequest(input: {
  storefront: PlayerStorefrontSaleRequestStorefront | null;
  lootItem: PlayerStorefrontSaleRequestLootItem | null;
  sellScope: PlayerStorefrontSaleRequestScope;
  requestedQuantity: number;
  heldQuantity: number;
  hasExistingPendingRequest: boolean;
  requestedNote?: string | null;
}): PlayerStorefrontSaleRequestPlan {
  if (
    !input.storefront ||
    !input.lootItem ||
    !isNonEmptyText(input.storefront.id) ||
    !isNonEmptyText(input.lootItem.id) ||
    !isNonEmptyText(input.lootItem.name) ||
    !isNonEmptyText(input.lootItem.kind) ||
    !isNonEmptyText(input.lootItem.rarity) ||
    !isValidCopperAmount(input.storefront.cashOnHand) ||
    !isValidPositiveQuantity(input.requestedQuantity) ||
    !isValidCopperAmount(input.heldQuantity) ||
    (input.lootItem.goldValue !== null &&
      input.lootItem.goldValue !== undefined &&
      !isValidCopperAmount(input.lootItem.goldValue)) ||
    input.hasExistingPendingRequest ||
    input.heldQuantity < input.requestedQuantity
  ) {
    return {
      ok: false,
      reason: "invalid-player-storefront-state",
    };
  }

  const fit = scoreStorefrontItemFit(input.storefront.shopType, {
    kind: input.lootItem.kind,
    rarity: input.lootItem.rarity,
    name: input.lootItem.name,
    description: input.lootItem.description,
    sourceTag: input.lootItem.sourceTag,
  });
  const priceSuggestion = suggestPlayerSellPrice({
    fitScore: fit.score,
    currentPriceCopper: input.lootItem.goldValue ?? 25,
    storeCashCopper: input.storefront.cashOnHand,
  });

  if (fit.tier === "POOR" || priceSuggestion.suggestedPriceCopper <= 0) {
    return {
      ok: false,
      reason: "invalid-player-storefront-state",
    };
  }

  const suggestedPriceGold = Math.min(
    priceSuggestion.suggestedPriceCopper * input.requestedQuantity,
    priceSuggestion.maxCashOfferCopper,
  );

  if (suggestedPriceGold <= 0) {
    return {
      ok: false,
      reason: "invalid-player-storefront-state",
    };
  }

  return {
    ok: true,
    requestIntent: {
      storefrontId: input.storefront.id,
      lootItemId: input.lootItem.id,
      sellScope: input.sellScope,
      quantity: input.requestedQuantity,
      suggestedPriceGold,
      fitScore: fit.score,
      note:
        input.requestedNote?.trim() ||
        `Player offered ${input.requestedQuantity} from ${input.sellScope.toLowerCase()}.`,
    },
  };
}
