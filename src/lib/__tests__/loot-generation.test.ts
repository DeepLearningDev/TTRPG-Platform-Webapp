import { describe, expect, it } from "vitest";
import {
  EncounterDifficulty,
  LootKind,
  LootRarity,
} from "@prisma/client";
import {
  computeLootGenerationProfile,
  generateLootPoolItems,
  runPartyLootRoll,
} from "@/lib/loot-generation";

describe("computeLootGenerationProfile", () => {
  it("raises target tier and item count for harder encounters", () => {
    const easy = computeLootGenerationProfile(5, EncounterDifficulty.EASY);
    const boss = computeLootGenerationProfile(5, EncounterDifficulty.BOSS);

    expect(boss.targetTier).toBeGreaterThanOrEqual(easy.targetTier);
    expect(boss.itemCount).toBeGreaterThanOrEqual(easy.itemCount);
  });
});

describe("generateLootPoolItems", () => {
  it("returns a bounded set of candidates influenced by rarity tier", () => {
    const now = new Date("2026-04-09T12:00:00.000Z");
    const items = generateLootPoolItems({
      campaignId: "camp-1",
      seedKey: "encounter-1",
      partyLevel: 10,
      difficulty: EncounterDifficulty.HARD,
      maxItems: 3,
      candidates: [
        {
          id: "common-1",
          name: "Traveller's Cloak",
          rarity: LootRarity.COMMON,
          kind: LootKind.WONDROUS,
          updatedAt: now,
          goldValue: 25,
        },
        {
          id: "rare-1",
          name: "Sunforged Band",
          rarity: LootRarity.RARE,
          kind: LootKind.WONDROUS,
          updatedAt: now,
          goldValue: 500,
        },
        {
          id: "vr-1",
          name: "Stormwake Lens",
          rarity: LootRarity.VERY_RARE,
          kind: LootKind.WONDROUS,
          updatedAt: now,
          goldValue: 2_500,
        },
        {
          id: "leg-1",
          name: "Crown of the Last Tide",
          rarity: LootRarity.LEGENDARY,
          kind: LootKind.WONDROUS,
          updatedAt: now,
          goldValue: 10_000,
        },
      ],
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.every((item) => item.quantity === 1)).toBe(true);
    expect(items.some((item) => item.raritySnapshot === LootRarity.RARE)).toBe(true);
  });
});

describe("runPartyLootRoll", () => {
  it("returns a winner and sorted roll summary", () => {
    const rolls = [9, 17, 12];
    let index = 0;

    const result = runPartyLootRoll(
      [
        { id: "c1", name: "Miri", level: 5 },
        { id: "c2", name: "Toren", level: 4 },
        { id: "c3", name: "Sella", level: 6 },
      ],
      () => {
        const roll = rolls[index] ?? 1;
        index += 1;
        return roll;
      },
    );

    expect(result.winner.name).toBe("Toren");
    expect(result.rolls.map((entry) => entry.roll)).toEqual([17, 12, 9]);
    expect(result.summary).toContain("Winner: Toren.");
  });
});
