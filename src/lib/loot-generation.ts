import { EncounterDifficulty, LootItem, LootKind, LootRarity } from "@prisma/client";

type LootCandidate = Pick<
  LootItem,
  "id" | "name" | "rarity" | "kind" | "updatedAt" | "goldValue"
>;

type GeneratedLootPoolItem = {
  lootItemId: string;
  itemNameSnapshot: string;
  raritySnapshot: LootRarity;
  kindSnapshot: LootKind;
  quantity: number;
};

type PartyRollCharacter = {
  id: string;
  name: string;
  level: number;
};

type PartyRollResult = {
  winner: PartyRollCharacter;
  rolls: Array<PartyRollCharacter & { roll: number }>;
  summary: string;
};

const RARITY_RANK: Record<LootRarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  VERY_RARE: 3,
  LEGENDARY: 4,
};

const DIFFICULTY_TIER_BONUS: Record<EncounterDifficulty, number> = {
  EASY: 0,
  MEDIUM: 0,
  HARD: 1,
  DEADLY: 1,
  BOSS: 2,
};

const DIFFICULTY_COUNT_BONUS: Record<EncounterDifficulty, number> = {
  EASY: 0,
  MEDIUM: 0,
  HARD: 1,
  DEADLY: 1,
  BOSS: 2,
};

export function computeLootGenerationProfile(
  partyLevel: number,
  difficulty: EncounterDifficulty,
) {
  const normalizedLevel = Math.max(1, Math.min(20, partyLevel));
  const baseTier = Math.min(4, Math.floor((normalizedLevel - 1) / 4));
  const targetTier = Math.min(4, baseTier + DIFFICULTY_TIER_BONUS[difficulty]);
  const minTier = Math.max(0, targetTier - 1);
  const itemCount = Math.max(
    1,
    Math.min(4, 1 + Math.floor((normalizedLevel - 1) / 6) + DIFFICULTY_COUNT_BONUS[difficulty]),
  );

  return {
    targetTier,
    minTier,
    itemCount,
  };
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function candidateRank(candidate: LootCandidate) {
  return RARITY_RANK[candidate.rarity];
}

export function generateLootPoolItems(input: {
  campaignId: string;
  seedKey: string;
  partyLevel: number;
  difficulty: EncounterDifficulty;
  candidates: LootCandidate[];
  maxItems?: number;
}): GeneratedLootPoolItem[] {
  if (input.candidates.length === 0) {
    return [];
  }

  const profile = computeLootGenerationProfile(input.partyLevel, input.difficulty);
  const cappedItemCount = Math.max(
    1,
    Math.min(input.maxItems ?? profile.itemCount, profile.itemCount, 4),
  );
  const seed = hashSeed(
    `${input.campaignId}|${input.seedKey}|${input.partyLevel}|${input.difficulty}|${input.candidates.length}`,
  );

  const preferredCandidates = input.candidates.filter((candidate) => {
    const rank = candidateRank(candidate);
    return rank >= profile.minTier && rank <= profile.targetTier;
  });

  const pool = preferredCandidates.length > 0 ? preferredCandidates : input.candidates;

  const rankedCandidates = pool
    .map((candidate, index) => {
      const rank = candidateRank(candidate);
      const distance = Math.abs(rank - profile.targetTier);
      const goldWeight = candidate.goldValue ?? 0;
      const seedWeight = hashSeed(`${seed}|${candidate.id}|${candidate.updatedAt.toISOString()}|${index}`);

      return {
        candidate,
        score: distance * 10_000 + (seedWeight % 5_000) - goldWeight,
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.candidate.name.localeCompare(right.candidate.name);
    });

  return rankedCandidates.slice(0, cappedItemCount).map(({ candidate }) => ({
    lootItemId: candidate.id,
    itemNameSnapshot: candidate.name,
    raritySnapshot: candidate.rarity,
    kindSnapshot: candidate.kind,
    quantity: 1,
  }));
}

export function runPartyLootRoll(
  characters: PartyRollCharacter[],
  rollFn: () => number,
): PartyRollResult {
  if (characters.length === 0) {
    throw new Error("Cannot run a party roll without characters");
  }

  const rolls = characters
    .map((character) => ({
      ...character,
      roll: rollFn(),
    }))
    .sort((left, right) => {
      if (right.roll !== left.roll) {
        return right.roll - left.roll;
      }

      if (right.level !== left.level) {
        return right.level - left.level;
      }

      return left.name.localeCompare(right.name);
    });

  const winner = rolls[0];
  const summary = rolls.map((entry) => `${entry.name} ${entry.roll}`).join(", ");

  return {
    winner,
    rolls,
    summary: `Roll-off: ${summary}. Winner: ${winner.name}.`,
  };
}
