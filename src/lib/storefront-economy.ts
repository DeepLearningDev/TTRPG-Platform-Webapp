import type { LootKind, LootRarity } from "@prisma/client";

export const SHOP_TYPES = [
  "GENERAL_STORE",
  "BLACKSMITH",
  "APOTHECARY",
  "ARCANE_SHOP",
  "JEWELRY_STORE",
  "WOODWORKING_SHOP",
] as const;

export type ShopType = (typeof SHOP_TYPES)[number];

export type CampaignEconomyPriceTier = "CHEAP" | "NORMAL" | "EXPENSIVE";

export type StorefrontEconomyLootItem = {
  kind: LootKind | string;
  rarity: LootRarity | string;
  name: string;
  description?: string | null;
  sourceTag?: string | null;
};

export type StorefrontFitScore = {
  score: number;
  tier: "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
  matchedTerms: string[];
};

export type StorefrontCurrentPrice = {
  basePriceCopper: number;
  currentPriceCopper: number;
  priceTier: CampaignEconomyPriceTier;
  tierMultiplier: number;
  demandMultiplier: number;
  demandAdjustmentPercent: number;
};

export type OnePurchaseDiscountPlan = {
  negotiationDc: number;
  succeeded: boolean;
  margin: number;
  discountPercent: number;
  discountCopper: number;
  discountedPriceCopper: number;
  appliesTo: "ONE_PURCHASE";
};

export type PlayerSellPriceSuggestion = {
  suggestedPriceCopper: number;
  offerPercent: number;
  cashLimited: boolean;
  maxCashOfferCopper: number;
};

export type StorefrontRestockItemPlan = {
  lootItemId: string;
  quantity: number;
  basePriceCopper: number;
  currentPriceCopper: number;
  fitScore: number;
};

export type DefaultStorefrontCatalogItem = StorefrontEconomyLootItem & {
  sourceKey: string;
  name: string;
  description: string;
  sourceTag: string;
  goldValue: number;
};

const SHOP_NAME_PARTS: Record<
  ShopType,
  {
    prefixes: string[];
    nouns: string[];
    suffixes: string[];
  }
> = {
  GENERAL_STORE: {
    prefixes: ["Copper", "Wayfarer's", "Hearth", "Market", "Crossroads"],
    nouns: ["Satchel", "Lantern", "Crate", "Counter", "Provision"],
    suffixes: ["General", "Goods", "Supply", "Exchange", "Mercantile"],
  },
  BLACKSMITH: {
    prefixes: ["Iron", "Ember", "Anvil", "Hammer", "Coalbright"],
    nouns: ["Forge", "Blade", "Shield", "Bellows", "Tongs"],
    suffixes: ["Smithy", "Armory", "Works", "Foundry", "Steel"],
  },
  APOTHECARY: {
    prefixes: ["Verdant", "Glass", "Moonleaf", "Bitterroot", "Violet"],
    nouns: ["Vial", "Mortar", "Herb", "Elixir", "Stillroom"],
    suffixes: ["Apothecary", "Remedies", "Tonics", "Dispensary", "Cures"],
  },
  ARCANE_SHOP: {
    prefixes: ["Runed", "Astral", "Gilded", "Whispering", "Eldritch"],
    nouns: ["Grimoire", "Wand", "Sigil", "Crystal", "Scroll"],
    suffixes: ["Arcana", "Reliquary", "Mysteries", "Enchantments", "Occult"],
  },
  JEWELRY_STORE: {
    prefixes: ["Golden", "Opal", "Velvet", "Silver", "Starlit"],
    nouns: ["Gem", "Diadem", "Facet", "Band", "Pearl"],
    suffixes: ["Jewelers", "Finery", "Treasures", "Atelier", "Adornments"],
  },
  WOODWORKING_SHOP: {
    prefixes: ["Oaken", "Cedar", "Riverbend", "Ashen", "Carved"],
    nouns: ["Bow", "Plane", "Chisel", "Lath", "Staff"],
    suffixes: ["Woodworks", "Joinery", "Carvers", "Workshop", "Mill"],
  },
};

const SHOP_FIT_RULES: Record<
  ShopType,
  {
    kindWeights: Partial<Record<string, number>>;
    rarityWeights: Partial<Record<string, number>>;
    terms: string[];
  }
> = {
  GENERAL_STORE: {
    kindWeights: {
      CONSUMABLE: 28,
      TOOL: 24,
      TREASURE: 14,
      WONDROUS: 8,
    },
    rarityWeights: {
      COMMON: 14,
      UNCOMMON: 10,
      RARE: 2,
      VERY_RARE: -8,
      LEGENDARY: -16,
    },
    terms: [
      "ration",
      "rope",
      "torch",
      "lantern",
      "pack",
      "kit",
      "tool",
      "provision",
      "supply",
      "camp",
      "travel",
    ],
  },
  BLACKSMITH: {
    kindWeights: {
      WEAPON: 32,
      ARMOR: 32,
      TOOL: 14,
      TREASURE: 2,
    },
    rarityWeights: {
      COMMON: 8,
      UNCOMMON: 12,
      RARE: 8,
      VERY_RARE: 0,
      LEGENDARY: -8,
    },
    terms: [
      "armor",
      "armour",
      "blade",
      "sword",
      "axe",
      "hammer",
      "shield",
      "mail",
      "steel",
      "iron",
      "forge",
      "anvil",
      "dagger",
    ],
  },
  APOTHECARY: {
    kindWeights: {
      CONSUMABLE: 36,
      TOOL: 8,
      WONDROUS: 4,
    },
    rarityWeights: {
      COMMON: 10,
      UNCOMMON: 12,
      RARE: 6,
      VERY_RARE: -2,
      LEGENDARY: -10,
    },
    terms: [
      "potion",
      "elixir",
      "antidote",
      "herb",
      "poison",
      "salve",
      "healing",
      "vial",
      "tonic",
      "remedy",
    ],
  },
  ARCANE_SHOP: {
    kindWeights: {
      WONDROUS: 34,
      CONSUMABLE: 18,
      TOOL: 10,
      TREASURE: 6,
    },
    rarityWeights: {
      COMMON: 0,
      UNCOMMON: 8,
      RARE: 14,
      VERY_RARE: 12,
      LEGENDARY: 6,
    },
    terms: [
      "wand",
      "staff",
      "scroll",
      "spell",
      "arcane",
      "enchanted",
      "rune",
      "crystal",
      "sigil",
      "grimoire",
    ],
  },
  JEWELRY_STORE: {
    kindWeights: {
      TREASURE: 34,
      WONDROUS: 16,
      TOOL: 2,
    },
    rarityWeights: {
      COMMON: -4,
      UNCOMMON: 6,
      RARE: 14,
      VERY_RARE: 14,
      LEGENDARY: 8,
    },
    terms: [
      "ring",
      "amulet",
      "necklace",
      "gem",
      "jewel",
      "pearl",
      "diamond",
      "gold",
      "silver",
      "crown",
      "bracelet",
    ],
  },
  WOODWORKING_SHOP: {
    kindWeights: {
      WEAPON: 18,
      TOOL: 30,
      WONDROUS: 8,
      ARMOR: 4,
    },
    rarityWeights: {
      COMMON: 10,
      UNCOMMON: 12,
      RARE: 6,
      VERY_RARE: -2,
      LEGENDARY: -10,
    },
    terms: [
      "bow",
      "arrow",
      "staff",
      "wand",
      "wood",
      "oak",
      "cedar",
      "carved",
      "chisel",
      "plane",
      "instrument",
      "shield",
    ],
  },
};

const RARITY_DC_MODIFIER: Record<string, number> = {
  COMMON: 0,
  UNCOMMON: 2,
  RARE: 4,
  VERY_RARE: 6,
  LEGENDARY: 8,
};

const RARITY_DISCOUNT_CAP: Record<string, number> = {
  COMMON: 20,
  UNCOMMON: 20,
  RARE: 15,
  VERY_RARE: 15,
  LEGENDARY: 10,
};

const PRICE_TIER_MULTIPLIER: Record<CampaignEconomyPriceTier, number> = {
  CHEAP: 0.5,
  NORMAL: 1,
  EXPENSIVE: 2,
};

const DEFAULT_STOREFRONT_CATALOG: Record<ShopType, DefaultStorefrontCatalogItem[]> = {
  GENERAL_STORE: [
    {
      sourceKey: "storefront-default:general-store:travel-rations",
      name: "Travel Rations",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      description: "Preserved food packed for road, dungeon, or sea travel.",
      sourceTag: "General goods",
      goldValue: 5,
    },
    {
      sourceKey: "storefront-default:general-store:silk-rope",
      name: "Silk Rope",
      kind: "TOOL",
      rarity: "COMMON",
      description: "A sturdy coil of travel rope for climbing, rigging, and camp work.",
      sourceTag: "General goods",
      goldValue: 10,
    },
    {
      sourceKey: "storefront-default:general-store:lantern-oil",
      name: "Lantern Oil",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      description: "Clean-burning oil for lanterns and dungeon supplies.",
      sourceTag: "General goods",
      goldValue: 8,
    },
  ],
  BLACKSMITH: [
    {
      sourceKey: "storefront-default:blacksmith:iron-sword",
      name: "Iron Sword",
      kind: "WEAPON",
      rarity: "COMMON",
      description: "A reliable forged steel blade from a working armory.",
      sourceTag: "Blacksmith goods",
      goldValue: 25,
    },
    {
      sourceKey: "storefront-default:blacksmith:steel-shield",
      name: "Steel Shield",
      kind: "ARMOR",
      rarity: "COMMON",
      description: "A hammered shield with reinforced iron bands.",
      sourceTag: "Blacksmith goods",
      goldValue: 35,
    },
    {
      sourceKey: "storefront-default:blacksmith:repair-tools",
      name: "Forge Repair Tools",
      kind: "TOOL",
      rarity: "COMMON",
      description: "Tongs, hammer, and field repair tools for metal gear.",
      sourceTag: "Blacksmith goods",
      goldValue: 18,
    },
  ],
  APOTHECARY: [
    {
      sourceKey: "storefront-default:apothecary:healing-tonic",
      name: "Healing Tonic",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      description: "A bitter red tonic prepared as a simple healing remedy.",
      sourceTag: "Apothecary goods",
      goldValue: 25,
    },
    {
      sourceKey: "storefront-default:apothecary:antidote-vial",
      name: "Antidote Vial",
      kind: "CONSUMABLE",
      rarity: "UNCOMMON",
      description: "A small vial used against poison, venom, and bad water.",
      sourceTag: "Apothecary goods",
      goldValue: 60,
    },
    {
      sourceKey: "storefront-default:apothecary:moonleaf-herbs",
      name: "Moonleaf Herbs",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      description: "Bundled herbs for salves, poultices, and field remedies.",
      sourceTag: "Apothecary goods",
      goldValue: 12,
    },
  ],
  ARCANE_SHOP: [
    {
      sourceKey: "storefront-default:arcane-shop:blank-scroll",
      name: "Blank Spell Scroll",
      kind: "TOOL",
      rarity: "COMMON",
      description: "Prepared parchment for arcane scroll work and spell copying.",
      sourceTag: "Arcane goods",
      goldValue: 40,
    },
    {
      sourceKey: "storefront-default:arcane-shop:focus-crystal",
      name: "Focus Crystal",
      kind: "WONDROUS",
      rarity: "UNCOMMON",
      description: "A cut crystal used as an arcane focus or ritual component.",
      sourceTag: "Arcane goods",
      goldValue: 120,
    },
    {
      sourceKey: "storefront-default:arcane-shop:runed-chalk",
      name: "Runed Chalk",
      kind: "CONSUMABLE",
      rarity: "COMMON",
      description: "Chalk for sigils, wards, and temporary ritual circles.",
      sourceTag: "Arcane goods",
      goldValue: 15,
    },
  ],
  JEWELRY_STORE: [
    {
      sourceKey: "storefront-default:jewelry-store:silver-ring",
      name: "Silver Ring",
      kind: "TREASURE",
      rarity: "COMMON",
      description: "A polished silver band suitable for trade, gifts, or enchantment.",
      sourceTag: "Jewelry goods",
      goldValue: 45,
    },
    {
      sourceKey: "storefront-default:jewelry-store:opal-pendant",
      name: "Opal Pendant",
      kind: "TREASURE",
      rarity: "UNCOMMON",
      description: "A small opal pendant set in fine wire.",
      sourceTag: "Jewelry goods",
      goldValue: 160,
    },
    {
      sourceKey: "storefront-default:jewelry-store:loose-gems",
      name: "Loose Gems",
      kind: "TREASURE",
      rarity: "COMMON",
      description: "A pouch of cut gems used by jewelers and moneyed travelers.",
      sourceTag: "Jewelry goods",
      goldValue: 75,
    },
  ],
  WOODWORKING_SHOP: [
    {
      sourceKey: "storefront-default:woodworking-shop:oak-staff",
      name: "Oak Staff",
      kind: "WEAPON",
      rarity: "COMMON",
      description: "A balanced carved oak staff for travel or combat.",
      sourceTag: "Woodworking goods",
      goldValue: 12,
    },
    {
      sourceKey: "storefront-default:woodworking-shop:shortbow",
      name: "Shortbow",
      kind: "WEAPON",
      rarity: "COMMON",
      description: "A flexible wooden bow with a waxed string.",
      sourceTag: "Woodworking goods",
      goldValue: 30,
    },
    {
      sourceKey: "storefront-default:woodworking-shop:carver-tools",
      name: "Carver Tools",
      kind: "TOOL",
      rarity: "COMMON",
      description: "Chisels, plane, and carving tools for wood repairs.",
      sourceTag: "Woodworking goods",
      goldValue: 18,
    },
  ],
};

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function chooseDeterministic<T>(values: readonly T[], hash: number, shift: number) {
  return values[(hash >>> shift) % values.length];
}

function seededSortValue(seed: string, value: string) {
  return hashSeed(`${seed}:${value}`);
}

function normalizeEnumValue(value: string) {
  return value.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isValidCopperAmount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function scoreTier(score: number): StorefrontFitScore["tier"] {
  if (score >= 80) {
    return "EXCELLENT";
  }

  if (score >= 60) {
    return "GOOD";
  }

  if (score >= 35) {
    return "FAIR";
  }

  return "POOR";
}

export function generateShopName(type: ShopType, seed: string | number) {
  const parts = SHOP_NAME_PARTS[type];
  const hash = hashSeed(`${type}:${seed}`);
  const prefix = chooseDeterministic(parts.prefixes, hash, 0);
  const noun = chooseDeterministic(parts.nouns, hash, 8);
  const suffix = chooseDeterministic(parts.suffixes, hash, 16);

  return `${prefix} ${noun} ${suffix}`;
}

export function scoreStorefrontItemFit(
  shopType: ShopType,
  item: StorefrontEconomyLootItem,
): StorefrontFitScore {
  const rules = SHOP_FIT_RULES[shopType];
  const kind = normalizeEnumValue(item.kind);
  const rarity = normalizeEnumValue(item.rarity);
  const haystack = [item.name, item.description, item.sourceTag]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const matchedTerms = rules.terms.filter((term) => haystack.includes(term));
  const keywordScore = clamp(matchedTerms.length * 8, 0, 28);
  const rawScore =
    20 +
    (rules.kindWeights[kind] ?? -10) +
    (rules.rarityWeights[rarity] ?? 0) +
    keywordScore;
  const score = clamp(rawScore, 0, 100);

  return {
    score,
    tier: scoreTier(score),
    matchedTerms,
  };
}

export function getCampaignEconomyPriceTierMultiplier(tier: CampaignEconomyPriceTier) {
  return PRICE_TIER_MULTIPLIER[tier];
}

export function applyCampaignEconomyPriceTier(
  basePriceCopper: number,
  tier: CampaignEconomyPriceTier,
) {
  if (!isValidCopperAmount(basePriceCopper)) {
    throw new Error("Campaign economy base price must be a non-negative safe integer.");
  }

  if (basePriceCopper === 0) {
    return 0;
  }

  return Math.max(
    1,
    Math.round(basePriceCopper * getCampaignEconomyPriceTierMultiplier(tier)),
  );
}

export function calculateStorefrontCurrentPrice(input: {
  basePriceCopper: number;
  purchaseCount: number;
  soldToStoreCount: number;
  stock: number;
  priceTier?: CampaignEconomyPriceTier;
}): StorefrontCurrentPrice {
  if (
    !isValidCopperAmount(input.basePriceCopper) ||
    !isValidCopperAmount(input.purchaseCount) ||
    !isValidCopperAmount(input.soldToStoreCount) ||
    !isValidCopperAmount(input.stock)
  ) {
    throw new Error("Storefront price inputs must be non-negative safe integers.");
  }

  const scarcityAdjustment =
    input.stock === 0 ? 0.18 : input.stock === 1 ? 0.12 : input.stock >= 8 ? -0.08 : 0;
  const demandPressure =
    input.purchaseCount * 0.08 -
    input.soldToStoreCount * 0.05 -
    input.stock * 0.02 +
    scarcityAdjustment;
  const demandMultiplier = roundToTwoDecimals(1 + clamp(demandPressure, -0.35, 0.75));
  const priceTier = input.priceTier ?? "NORMAL";
  const tierMultiplier = getCampaignEconomyPriceTierMultiplier(priceTier);
  const tieredBasePriceCopper = applyCampaignEconomyPriceTier(input.basePriceCopper, priceTier);
  const currentPriceCopper =
    tieredBasePriceCopper === 0
      ? 0
      : Math.max(1, Math.round(tieredBasePriceCopper * demandMultiplier));

  return {
    basePriceCopper: input.basePriceCopper,
    currentPriceCopper,
    priceTier,
    tierMultiplier,
    demandMultiplier,
    demandAdjustmentPercent: Math.round((demandMultiplier - 1) * 100),
  };
}

export function getDefaultStorefrontCatalog(shopType: ShopType) {
  return DEFAULT_STOREFRONT_CATALOG[shopType].map((item) => ({ ...item }));
}

export function planStorefrontWeeklyRestock(input: {
  shopType: ShopType;
  items: Array<StorefrontEconomyLootItem & { id: string; goldValue?: number | null }>;
  seed: string;
  marketWeek: number;
  priceTier?: CampaignEconomyPriceTier;
  maxItems?: number;
}): StorefrontRestockItemPlan[] {
  const maxItems = clamp(input.maxItems ?? 4, 1, 8);
  const seed = `${input.seed}:${input.shopType}:${input.marketWeek}`;

  return input.items
    .map((item) => {
      const fit = scoreStorefrontItemFit(input.shopType, item);

      return {
        item,
        fit,
      };
    })
    .filter(({ fit }) => fit.score >= 35)
    .sort((left, right) => {
      if (right.fit.score !== left.fit.score) {
        return right.fit.score - left.fit.score;
      }

      return (
        seededSortValue(seed, left.item.id) -
        seededSortValue(seed, right.item.id)
      );
    })
    .slice(0, maxItems)
    .map(({ item, fit }) => {
      const basePriceCopper = item.goldValue ?? estimateFallbackPrice(item.rarity);
      const quantity = getRestockQuantity(item.rarity, fit.score, seed, item.id);
      const price = calculateStorefrontCurrentPrice({
        basePriceCopper,
        purchaseCount: 0,
        soldToStoreCount: 0,
        stock: quantity,
        priceTier: input.priceTier,
      });

      return {
        lootItemId: item.id,
        quantity,
        basePriceCopper,
        currentPriceCopper: price.currentPriceCopper,
        fitScore: fit.score,
      };
    });
}

function estimateFallbackPrice(rarity: LootRarity | string) {
  switch (normalizeEnumValue(rarity)) {
    case "COMMON":
      return 25;
    case "UNCOMMON":
      return 100;
    case "RARE":
      return 500;
    case "VERY_RARE":
      return 2_500;
    case "LEGENDARY":
      return 10_000;
    default:
      return 25;
  }
}

function getRestockQuantity(
  rarity: LootRarity | string,
  fitScore: number,
  seed: string,
  itemId: string,
) {
  const hash = seededSortValue(seed, itemId);
  const rarityKey = normalizeEnumValue(rarity);
  const baseQuantity =
    rarityKey === "COMMON"
      ? 3
      : rarityKey === "UNCOMMON"
        ? 2
        : 1;
  const fitBonus = fitScore >= 80 && rarityKey === "COMMON" ? 1 : 0;
  const variance = hash % 2;

  return clamp(baseQuantity + fitBonus + variance, 1, 5);
}

export function calculateNegotiationDc(input: {
  fitScore: number;
  rarity: LootRarity | string;
}) {
  const rarity = normalizeEnumValue(input.rarity);
  const fitScore = clamp(Math.round(input.fitScore), 0, 100);
  const fitAdjustment = clamp(Math.round((50 - fitScore) / 10), -3, 5);

  return clamp(10 + (RARITY_DC_MODIFIER[rarity] ?? 3) + fitAdjustment, 8, 25);
}

export function planOnePurchaseDiscount(input: {
  currentPriceCopper: number;
  fitScore: number;
  rarity: LootRarity | string;
  negotiationTotal: number;
}): OnePurchaseDiscountPlan {
  if (
    !isValidCopperAmount(input.currentPriceCopper) ||
    !Number.isSafeInteger(input.negotiationTotal)
  ) {
    throw new Error("Storefront negotiation inputs must be safe integers.");
  }

  const rarity = normalizeEnumValue(input.rarity);
  const negotiationDc = calculateNegotiationDc({
    fitScore: input.fitScore,
    rarity,
  });
  const margin = input.negotiationTotal - negotiationDc;
  const succeeded = margin >= 0;
  const discountPercent = succeeded
    ? clamp(5 + Math.floor(margin / 5) * 5, 5, RARITY_DISCOUNT_CAP[rarity] ?? 15)
    : 0;
  const discountCopper = Math.round(input.currentPriceCopper * (discountPercent / 100));

  return {
    negotiationDc,
    succeeded,
    margin,
    discountPercent,
    discountCopper,
    discountedPriceCopper: input.currentPriceCopper - discountCopper,
    appliesTo: "ONE_PURCHASE",
  };
}

export function suggestPlayerSellPrice(input: {
  fitScore: number;
  currentPriceCopper: number;
  storeCashCopper: number;
}): PlayerSellPriceSuggestion {
  if (
    !isValidCopperAmount(input.currentPriceCopper) ||
    !isValidCopperAmount(input.storeCashCopper)
  ) {
    throw new Error("Storefront sell price inputs must be non-negative safe integers.");
  }

  const fitScore = clamp(Math.round(input.fitScore), 0, 100);
  const offerPercent = clamp(25 + Math.round(fitScore * 0.45), 25, 70);
  const marketOfferCopper = Math.round(input.currentPriceCopper * (offerPercent / 100));
  const maxCashOfferCopper = Math.floor(input.storeCashCopper * 0.8);
  const suggestedPriceCopper = Math.min(marketOfferCopper, maxCashOfferCopper);

  return {
    suggestedPriceCopper,
    offerPercent,
    cashLimited: suggestedPriceCopper < marketOfferCopper,
    maxCashOfferCopper,
  };
}
