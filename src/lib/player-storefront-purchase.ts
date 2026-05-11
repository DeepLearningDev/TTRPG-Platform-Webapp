export type PlayerStorefrontPurchaseOffer = {
  id: string;
  itemName: string;
  itemDescription: string;
  rarity: string;
  kind: string;
  priceGold: number;
  currentPriceGold?: number | null;
  negotiatedPriceGold?: number | null;
  quantity: number;
  lootItemId: string | null;
};

export type PlayerStorefrontPurchaseReason =
  | "invalid-player-storefront-state"
  | "insufficient-player-gold";

export type PlayerStorefrontPurchaseLootItemIntent = {
  existingLootItemId: string | null;
  createLootItem: {
    name: string;
    rarity: string;
    kind: string;
    description: string;
    sourceTag: string;
  } | null;
};

export type PlayerStorefrontPurchaseLedgerIntent = {
  scope: "BANK";
  entryType: "PURCHASE";
  lootItemId: string | null;
  quantity: number;
  goldDelta: number;
  note: string;
};

export type PlayerStorefrontPurchasePlan =
  | {
      ok: true;
      offerId: string;
      totalPriceCopper: number;
      remainingStock: number;
      lootItemIntent: PlayerStorefrontPurchaseLootItemIntent;
      ledgerIntent: PlayerStorefrontPurchaseLedgerIntent;
    }
  | {
      ok: false;
      reason: PlayerStorefrontPurchaseReason;
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

function isValidStockQuantity(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasValidLootItemFields(offer: PlayerStorefrontPurchaseOffer) {
  return (
    isNonEmptyText(offer.itemName) &&
    isNonEmptyText(offer.itemDescription) &&
    isNonEmptyText(offer.rarity) &&
    isNonEmptyText(offer.kind)
  );
}

export function getStorefrontOfferEffectivePrice(offer: PlayerStorefrontPurchaseOffer) {
  if (offer.negotiatedPriceGold !== null && offer.negotiatedPriceGold !== undefined) {
    return offer.negotiatedPriceGold;
  }

  if (offer.currentPriceGold && offer.currentPriceGold > 0) {
    return offer.currentPriceGold;
  }

  return offer.priceGold;
}

export function planPlayerStorefrontPurchase(input: {
  offer: PlayerStorefrontPurchaseOffer;
  requestedQuantity: number;
  bankCopperBalance: number;
}): PlayerStorefrontPurchasePlan {
  const { offer } = input;
  const effectivePriceGold = getStorefrontOfferEffectivePrice(offer);

  if (
    !isNonEmptyText(offer.id) ||
    !hasValidLootItemFields(offer) ||
    !isValidCopperAmount(effectivePriceGold) ||
    !isValidStockQuantity(offer.quantity) ||
    !isValidPositiveQuantity(input.requestedQuantity) ||
    !isValidCopperAmount(input.bankCopperBalance) ||
    (offer.lootItemId !== null && !isNonEmptyText(offer.lootItemId))
  ) {
    return {
      ok: false,
      reason: "invalid-player-storefront-state",
    };
  }

  const totalPriceCopper = effectivePriceGold * input.requestedQuantity;

  if (
    !Number.isSafeInteger(totalPriceCopper) ||
    offer.quantity < input.requestedQuantity
  ) {
    return {
      ok: false,
      reason: "invalid-player-storefront-state",
    };
  }

  if (input.bankCopperBalance < totalPriceCopper) {
    return {
      ok: false,
      reason: "insufficient-player-gold",
    };
  }

  const remainingStock = offer.quantity - input.requestedQuantity;

  return {
    ok: true,
    offerId: offer.id,
    totalPriceCopper,
    remainingStock,
    lootItemIntent: {
      existingLootItemId: offer.lootItemId,
      createLootItem: offer.lootItemId
        ? null
        : {
            name: offer.itemName.trim(),
            rarity: offer.rarity,
            kind: offer.kind,
            description: offer.itemDescription.trim(),
            sourceTag: "Storefront purchase",
          },
    },
    ledgerIntent: {
      scope: "BANK",
      entryType: "PURCHASE",
      lootItemId: offer.lootItemId,
      quantity: input.requestedQuantity,
      goldDelta: -totalPriceCopper,
      note: `Purchased ${input.requestedQuantity}x ${offer.itemName.trim()} from the player storefront.`,
    },
  };
}
