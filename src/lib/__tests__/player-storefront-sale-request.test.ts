import { describe, expect, it } from "vitest";
import {
  planPlayerStorefrontSaleRequest,
  type PlayerStorefrontSaleRequestStorefront,
} from "@/lib/player-storefront-sale-request";

const storefront: PlayerStorefrontSaleRequestStorefront = {
  id: "storefront-1",
  shopType: "BLACKSMITH",
  cashOnHand: 2000,
};

const lootItem = {
  id: "loot-iron-sword",
  kind: "WEAPON",
  rarity: "COMMON",
  name: "Iron Sword",
  description: "A forged steel blade with a worn leather grip.",
  sourceTag: "Dungeon loot",
  goldValue: 25,
};

describe("planPlayerStorefrontSaleRequest", () => {
  it("plans a pending sale request when the item fits the store and is held", () => {
    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem,
        sellScope: "BANK",
        requestedQuantity: 2,
        heldQuantity: 3,
        hasExistingPendingRequest: false,
        requestedNote: "  Haggle if possible. ",
      }),
    ).toEqual({
      ok: true,
      requestIntent: {
        storefrontId: "storefront-1",
        lootItemId: "loot-iron-sword",
        sellScope: "BANK",
        quantity: 2,
        suggestedPriceGold: 32,
        fitScore: 88,
        note: "Haggle if possible.",
      },
    });
  });

  it("uses the scope-aware default note when the player leaves notes blank", () => {
    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem,
        sellScope: "INVENTORY",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
        requestedNote: "",
      }),
    ).toMatchObject({
      ok: true,
      requestIntent: {
        sellScope: "INVENTORY",
        note: "Player offered 1 from inventory.",
      },
    });
  });

  it("caps multi-item sale request payouts against store cash", () => {
    expect(
      planPlayerStorefrontSaleRequest({
        storefront: {
          ...storefront,
          cashOnHand: 50,
        },
        lootItem: {
          ...lootItem,
          goldValue: 100,
        },
        sellScope: "BANK",
        requestedQuantity: 3,
        heldQuantity: 3,
        hasExistingPendingRequest: false,
      }),
    ).toMatchObject({
      ok: true,
      requestIntent: {
        suggestedPriceGold: 40,
      },
    });
  });

  it("rejects missing entities, duplicate pending requests, and insufficient holdings", () => {
    const invalid = {
      ok: false,
      reason: "invalid-player-storefront-state",
    };

    expect(
      planPlayerStorefrontSaleRequest({
        storefront: null,
        lootItem,
        sellScope: "BANK",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
      }),
    ).toEqual(invalid);

    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem,
        sellScope: "BANK",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: true,
      }),
    ).toEqual(invalid);

    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem,
        sellScope: "BANK",
        requestedQuantity: 2,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
      }),
    ).toEqual(invalid);

    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem: {
          ...lootItem,
          goldValue: -1,
        },
        sellScope: "BANK",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
      }),
    ).toEqual(invalid);
  });

  it("rejects items that do not fit the shop or cannot receive a cash offer", () => {
    expect(
      planPlayerStorefrontSaleRequest({
        storefront,
        lootItem: {
          ...lootItem,
          kind: "CONSUMABLE",
          name: "Moonleaf Herbs",
          description: "A bundle of medicinal herbs.",
        },
        sellScope: "BANK",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-storefront-state",
    });

    expect(
      planPlayerStorefrontSaleRequest({
        storefront: {
          ...storefront,
          cashOnHand: 0,
        },
        lootItem,
        sellScope: "BANK",
        requestedQuantity: 1,
        heldQuantity: 1,
        hasExistingPendingRequest: false,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-player-storefront-state",
    });
  });
});
