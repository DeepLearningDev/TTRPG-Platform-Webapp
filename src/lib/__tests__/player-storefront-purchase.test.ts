import { describe, expect, it } from "vitest";
import { planPlayerStorefrontPurchase } from "@/lib/player-storefront-purchase";

const offer = {
  id: "offer-1",
  itemName: "Moonlit Dagger",
  itemDescription: "A silvered dagger that glows under moonlight.",
  rarity: "UNCOMMON",
  kind: "WEAPON",
  priceGold: 125,
  currentPriceGold: null,
  negotiatedPriceGold: null,
  quantity: 4,
  lootItemId: "loot-moonlit-dagger",
};

describe("planPlayerStorefrontPurchase", () => {
  it("plans a bank purchase against an existing loot item", () => {
    const plan = planPlayerStorefrontPurchase({
      offer,
      requestedQuantity: 2,
      bankCopperBalance: 500,
    });

    expect(plan).toEqual({
      ok: true,
      offerId: "offer-1",
      totalPriceCopper: 250,
      remainingStock: 2,
      lootItemIntent: {
        existingLootItemId: "loot-moonlit-dagger",
        createLootItem: null,
      },
      ledgerIntent: {
        scope: "BANK",
        entryType: "PURCHASE",
        lootItemId: "loot-moonlit-dagger",
        quantity: 2,
        goldDelta: -250,
        note: "Purchased 2x Moonlit Dagger from the player storefront.",
      },
    });
  });

  it("plans loot item creation when the offer is not linked to an item yet", () => {
    const plan = planPlayerStorefrontPurchase({
      offer: {
        ...offer,
        lootItemId: null,
      },
      requestedQuantity: 1,
      bankCopperBalance: 125,
    });

    expect(plan).toEqual({
      ok: true,
      offerId: "offer-1",
      totalPriceCopper: 125,
      remainingStock: 3,
      lootItemIntent: {
        existingLootItemId: null,
        createLootItem: {
          name: "Moonlit Dagger",
          rarity: "UNCOMMON",
          kind: "WEAPON",
          description: "A silvered dagger that glows under moonlight.",
          sourceTag: "Storefront purchase",
        },
      },
      ledgerIntent: {
        scope: "BANK",
        entryType: "PURCHASE",
        lootItemId: null,
        quantity: 1,
        goldDelta: -125,
        note: "Purchased 1x Moonlit Dagger from the player storefront.",
      },
    });
  });

  it("uses negotiated price before current market price and legacy price", () => {
    expect(
      planPlayerStorefrontPurchase({
        offer: {
          ...offer,
          priceGold: 125,
          currentPriceGold: 150,
          negotiatedPriceGold: 110,
        },
        requestedQuantity: 2,
        bankCopperBalance: 300,
      }),
    ).toMatchObject({
      ok: true,
      totalPriceCopper: 220,
      ledgerIntent: {
        goldDelta: -220,
      },
    });

    expect(
      planPlayerStorefrontPurchase({
        offer: {
          ...offer,
          priceGold: 125,
          currentPriceGold: 150,
        },
        requestedQuantity: 2,
        bankCopperBalance: 300,
      }),
    ).toMatchObject({
      ok: true,
      totalPriceCopper: 300,
      ledgerIntent: {
        goldDelta: -300,
      },
    });
  });

  it("rejects invalid storefront basics and unavailable stock", () => {
    expect(
      planPlayerStorefrontPurchase({
        offer: {
          ...offer,
          id: "",
        },
        requestedQuantity: 1,
        bankCopperBalance: 500,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-storefront-state",
    });

    expect(
      planPlayerStorefrontPurchase({
        offer,
        requestedQuantity: 5,
        bankCopperBalance: 500,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-storefront-state",
    });
  });

  it("rejects purchases when the player bank balance cannot cover the total", () => {
    expect(
      planPlayerStorefrontPurchase({
        offer,
        requestedQuantity: 3,
        bankCopperBalance: 374,
      }),
    ).toEqual({
      ok: false,
      reason: "insufficient-player-gold",
    });
  });
});
