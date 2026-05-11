import { describe, expect, it } from "vitest";
import {
  applyCampaignEconomyPriceTier,
  buildStorefrontRestockCandidates,
  calculateNegotiationDc,
  calculateStorefrontCurrentPrice,
  generateShopName,
  getCampaignEconomyPriceTierMultiplier,
  getDefaultStorefrontCatalog,
  parseStorefrontSellItemRef,
  planAcceptedStorefrontSaleOfferPrice,
  planOnePurchaseDiscount,
  planStorefrontWeeklyRestock,
  scoreStorefrontItemFit,
  suggestPlayerSellPrice,
} from "@/lib/storefront-economy";

describe("storefront economy helpers", () => {
  it("generates deterministic shop names from type and seed", () => {
    expect(generateShopName("BLACKSMITH", "emberfall-3")).toBe(
      generateShopName("BLACKSMITH", "emberfall-3"),
    );
    expect(generateShopName("BLACKSMITH", "emberfall-3")).not.toBe(
      generateShopName("APOTHECARY", "emberfall-3"),
    );
  });

  it("scores item fit from kind, rarity, text, and source tag", () => {
    const blacksmithFit = scoreStorefrontItemFit("BLACKSMITH", {
      kind: "WEAPON",
      rarity: "UNCOMMON",
      name: "Iron Moonblade",
      description: "A forged steel blade with a balanced grip.",
      sourceTag: "Smith reward",
    });
    const apothecaryFit = scoreStorefrontItemFit("APOTHECARY", {
      kind: "WEAPON",
      rarity: "UNCOMMON",
      name: "Iron Moonblade",
      description: "A forged steel blade with a balanced grip.",
      sourceTag: "Smith reward",
    });

    expect(blacksmithFit).toEqual({
      score: 92,
      tier: "EXCELLENT",
      matchedTerms: ["blade", "steel", "iron", "forge"],
    });
    expect(apothecaryFit.score).toBeLessThan(blacksmithFit.score);
    expect(apothecaryFit.tier).toBe("POOR");
  });

  it("adjusts current price from demand, supply sold to store, and stock", () => {
    expect(
      calculateStorefrontCurrentPrice({
        basePriceCopper: 1000,
        purchaseCount: 5,
        soldToStoreCount: 1,
        stock: 1,
      }),
    ).toEqual({
      basePriceCopper: 1000,
      currentPriceCopper: 1450,
      priceTier: "NORMAL",
      tierMultiplier: 1,
      demandMultiplier: 1.45,
      demandAdjustmentPercent: 45,
    });

    expect(
      calculateStorefrontCurrentPrice({
        basePriceCopper: 1000,
        purchaseCount: 0,
        soldToStoreCount: 6,
        stock: 10,
      }).currentPriceCopper,
    ).toBe(650);
  });

  it("returns campaign economy price tier multipliers", () => {
    expect(getCampaignEconomyPriceTierMultiplier("CHEAP")).toBe(0.5);
    expect(getCampaignEconomyPriceTierMultiplier("NORMAL")).toBe(1);
    expect(getCampaignEconomyPriceTierMultiplier("EXPENSIVE")).toBe(2);
  });

  it("applies campaign economy tiers to base copper prices", () => {
    expect(applyCampaignEconomyPriceTier(1000, "CHEAP")).toBe(500);
    expect(applyCampaignEconomyPriceTier(1000, "NORMAL")).toBe(1000);
    expect(applyCampaignEconomyPriceTier(1000, "EXPENSIVE")).toBe(2000);
    expect(applyCampaignEconomyPriceTier(1, "CHEAP")).toBe(1);
    expect(applyCampaignEconomyPriceTier(0, "EXPENSIVE")).toBe(0);
  });

  it("applies campaign economy price tier before demand adjustment", () => {
    expect(
      calculateStorefrontCurrentPrice({
        basePriceCopper: 1000,
        purchaseCount: 5,
        soldToStoreCount: 1,
        stock: 1,
        priceTier: "CHEAP",
      }),
    ).toEqual({
      basePriceCopper: 1000,
      currentPriceCopper: 725,
      priceTier: "CHEAP",
      tierMultiplier: 0.5,
      demandMultiplier: 1.45,
      demandAdjustmentPercent: 45,
    });

    expect(
      calculateStorefrontCurrentPrice({
        basePriceCopper: 1,
        purchaseCount: 0,
        soldToStoreCount: 6,
        stock: 10,
        priceTier: "CHEAP",
      }).currentPriceCopper,
    ).toBe(1);
  });

  it("plans a one-purchase negotiation discount from fit and rarity", () => {
    expect(
      calculateNegotiationDc({
        fitScore: 88,
        rarity: "UNCOMMON",
      }),
    ).toBe(9);

    expect(
      planOnePurchaseDiscount({
        currentPriceCopper: 1450,
        fitScore: 88,
        rarity: "UNCOMMON",
        negotiationTotal: 19,
      }),
    ).toEqual({
      negotiationDc: 9,
      succeeded: true,
      margin: 10,
      discountPercent: 15,
      discountCopper: 218,
      discountedPriceCopper: 1232,
      appliesTo: "ONE_PURCHASE",
    });

    expect(
      planOnePurchaseDiscount({
        currentPriceCopper: 1450,
        fitScore: 10,
        rarity: "LEGENDARY",
        negotiationTotal: 12,
      }).succeeded,
    ).toBe(false);
  });

  it("suggests player sell prices from fit, market price, and store cash", () => {
    expect(
      suggestPlayerSellPrice({
        fitScore: 88,
        currentPriceCopper: 1450,
        storeCashCopper: 2000,
      }),
    ).toEqual({
      suggestedPriceCopper: 943,
      offerPercent: 65,
      cashLimited: false,
      maxCashOfferCopper: 1600,
    });

    expect(
      suggestPlayerSellPrice({
        fitScore: 88,
        currentPriceCopper: 1450,
        storeCashCopper: 500,
      }),
    ).toEqual({
      suggestedPriceCopper: 400,
      offerPercent: 65,
      cashLimited: true,
      maxCashOfferCopper: 400,
    });
  });

  it("plans deterministic weekly restock from fitting items and campaign price tier", () => {
    const items = [
      {
        id: "rope",
        kind: "TOOL",
        rarity: "COMMON",
        name: "Silk Rope",
        description: "A travel rope for climbing and camp supply.",
        sourceTag: "General goods",
        goldValue: 10,
      },
      {
        id: "potion",
        kind: "CONSUMABLE",
        rarity: "UNCOMMON",
        name: "Healing Potion",
        description: "A red vial of healing tonic.",
        sourceTag: "Apothecary goods",
        goldValue: 50,
      },
      {
        id: "sword",
        kind: "WEAPON",
        rarity: "COMMON",
        name: "Iron Sword",
        description: "A forged steel blade.",
        sourceTag: "Blacksmith goods",
        goldValue: 25,
      },
    ];

    const firstPlan = planStorefrontWeeklyRestock({
      shopType: "GENERAL_STORE",
      items,
      seed: "campaign-1",
      marketWeek: 2,
      priceTier: "EXPENSIVE",
    });
    const secondPlan = planStorefrontWeeklyRestock({
      shopType: "GENERAL_STORE",
      items,
      seed: "campaign-1",
      marketWeek: 2,
      priceTier: "EXPENSIVE",
    });

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan[0]).toMatchObject({
      lootItemId: "rope",
      basePriceCopper: 10,
      fitScore: 86,
    });
    expect(firstPlan[0]?.currentPriceCopper).toBeGreaterThan(10);
    expect(firstPlan.some((item) => item.lootItemId === "sword")).toBe(false);
  });

  it("provides fallback catalog goods for each shop type", () => {
    const generalGoods = getDefaultStorefrontCatalog("GENERAL_STORE");
    const blacksmithGoods = getDefaultStorefrontCatalog("BLACKSMITH");

    expect(generalGoods).toHaveLength(3);
    expect(generalGoods[0]).toMatchObject({
      sourceKey: "storefront-default:general-store:travel-rations",
      kind: "CONSUMABLE",
      rarity: "COMMON",
    });
    expect(blacksmithGoods.some((item) => item.name.includes("Sword"))).toBe(true);
    expect(generalGoods[0]).not.toBe(getDefaultStorefrontCatalog("GENERAL_STORE")[0]);
  });

  it("deduplicates restock candidates and excludes items already offered", () => {
    const rope = {
      id: "rope",
      kind: "TOOL",
      rarity: "COMMON",
      name: "Silk Rope",
      description: "A travel rope.",
      sourceTag: "General goods",
      goldValue: 10,
    };
    const oil = {
      id: "oil",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      name: "Lantern Oil",
      description: "Camp oil.",
      sourceTag: "General goods",
      goldValue: 5,
    };
    const sword = {
      id: "sword",
      kind: "WEAPON",
      rarity: "COMMON",
      name: "Iron Sword",
      description: "A forged blade.",
      sourceTag: "Blacksmith goods",
      goldValue: 25,
    };

    expect(
      buildStorefrontRestockCandidates({
        campaignItems: [rope, sword],
        defaultCatalogItems: [rope, oil],
        existingLootItemIds: ["sword"],
      }).map((item) => item.id),
    ).toEqual(["rope", "oil"]);
  });

  it("parses player sell item references without allowing ambiguous sources", () => {
    expect(parseStorefrontSellItemRef("BANK:loot-1")).toEqual({
      scope: "BANK",
      lootItemId: "loot-1",
    });
    expect(parseStorefrontSellItemRef("INVENTORY:loot-2")).toEqual({
      scope: "INVENTORY",
      lootItemId: "loot-2",
    });
    expect(parseStorefrontSellItemRef("VAULT:loot-1")).toBeNull();
    expect(parseStorefrontSellItemRef("BANK:")).toBeNull();
    expect(parseStorefrontSellItemRef("BANK:loot-1:extra")).toBeNull();
  });

  it("plans accepted player-sale stock pricing after supply changes", () => {
    expect(
      planAcceptedStorefrontSaleOfferPrice({
        basePriceCopper: 1000,
        purchaseCount: 4,
        soldToStoreCount: 1,
        quantity: 2,
        acceptedQuantity: 3,
        priceTier: "NORMAL",
      }),
    ).toEqual({
      nextQuantity: 5,
      nextSoldToStoreCount: 4,
      currentPriceCopper: 1020,
    });
  });
});
