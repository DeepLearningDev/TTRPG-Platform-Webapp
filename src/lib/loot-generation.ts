import { EncounterDifficulty, LootItem, LootKind, LootRarity } from "@prisma/client";

export type LootCandidate = Pick<
  LootItem,
  "id" | "name" | "rarity" | "kind" | "updatedAt" | "goldValue"
>;

export type GeneratedLootPoolItem = {
  lootItemId: string | null;
  itemNameSnapshot: string;
  raritySnapshot: LootRarity;
  kindSnapshot: LootKind;
  quantity: number;
  resolutionMetadata?: string;
};

type EncounterMaterialMonster = {
  name: string;
  monsterType: string;
  tags: string;
  specialDrops: string;
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

export type LootPoolDraftEncounter = {
  id: string;
  title: string;
  difficulty: EncounterDifficulty;
  partyLevel: number;
  monsters: Array<{
    quantity: number;
    monster: Pick<
      EncounterMaterialMonster,
      "name" | "monsterType" | "tags" | "specialDrops"
    >;
  }>;
};

export type LootPoolDraft = {
  encounterId: string | null;
  title: string;
  sourceText: string;
  notes: string | null;
  partyLevel: number;
  difficulty: EncounterDifficulty;
  distributionMode: "ASSIGN" | "ROLL";
  items: GeneratedLootPoolItem[];
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

const MATERIAL_FALLBACK_RULES = [
  {
    keywords: ["dragon", "drake", "wyvern"],
    standardName: "Drake Heart",
    bossName: "Ancient Dragon Heart",
  },
  {
    keywords: ["demon", "devil", "fiend"],
    standardName: "Infernal Core",
    bossName: "Archdemon Core",
  },
  {
    keywords: ["undead", "skeleton", "zombie", "ghost", "wraith", "lich"],
    standardName: "Shadow Essence",
    bossName: "Shadow Essence",
  },
  {
    keywords: ["giant", "titan"],
    standardName: "Stone Heart",
    bossName: "Titan Core",
  },
  {
    keywords: ["elemental", "earth"],
    standardName: "Stone Heart",
    bossName: "Earth Titan Heart",
  },
  {
    keywords: ["storm", "lightning", "thunder"],
    standardName: "Storm Gland",
    bossName: "Storm Gland",
  },
  {
    keywords: ["construct", "golem", "clockwork"],
    standardName: "Arcane Residue",
    bossName: "Arcane Residue",
  },
  {
    keywords: ["celestial", "angel", "solar"],
    standardName: "Solar Fragment",
    bossName: "Solar Avatar Core",
  },
  {
    keywords: ["fey", "fae", "sprite", "dryad", "forest guardian"],
    standardName: "Fey Spirit",
    bossName: "Worldroot Spirit",
  },
  {
    keywords: ["spider", "snake", "serpent", "poison", "venom"],
    standardName: "Venom Sac",
    bossName: "Venom Sac",
  },
  {
    keywords: ["beast", "winter", "wolf", "bear"],
    standardName: "Frost Core",
    bossName: "Frost Core",
  },
] as const;

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

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function splitSpecialDrops(value: string) {
  return value
    .split(/[\n,;/]+/)
    .map((entry) => entry.trim().replace(/\.$/, ""))
    .filter((entry) => entry.length >= 3 && normalizeText(entry) !== "not set yet");
}

function findLootCandidateByName(candidates: LootCandidate[], name: string) {
  const normalizedName = normalizeText(name);

  return candidates.find((candidate) => normalizeText(candidate.name) === normalizedName) ?? null;
}

function inferFallbackMaterialName(
  monster: EncounterMaterialMonster,
  prefersBossMaterial: boolean,
) {
  const haystack = [
    monster.name,
    monster.monsterType,
    monster.tags,
    monster.specialDrops,
  ]
    .join(" ")
    .toLowerCase();

  for (const rule of MATERIAL_FALLBACK_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return prefersBossMaterial ? rule.bossName : rule.standardName;
    }
  }

  return prefersBossMaterial ? "Greater Monster Trophy" : "Monster Trophy";
}

function inferMaterialRarity(
  difficulty: EncounterDifficulty,
  prefersBossMaterial: boolean,
  hasExplicitDrop: boolean,
) {
  if (difficulty === EncounterDifficulty.BOSS) {
    return prefersBossMaterial ? LootRarity.LEGENDARY : LootRarity.VERY_RARE;
  }

  if (difficulty === EncounterDifficulty.DEADLY) {
    return prefersBossMaterial || hasExplicitDrop ? LootRarity.VERY_RARE : LootRarity.RARE;
  }

  if (difficulty === EncounterDifficulty.HARD) {
    return hasExplicitDrop ? LootRarity.RARE : LootRarity.UNCOMMON;
  }

  return hasExplicitDrop ? LootRarity.UNCOMMON : LootRarity.COMMON;
}

function inferMonsterMaterialQuantity(
  difficulty: EncounterDifficulty,
  monsterQuantity: number,
  prefersBossMaterial: boolean,
) {
  if (prefersBossMaterial || difficulty === EncounterDifficulty.BOSS) {
    return 1;
  }

  if (difficulty === EncounterDifficulty.DEADLY) {
    return Math.min(2, Math.max(1, Math.floor(monsterQuantity / 2)));
  }

  return Math.min(2, monsterQuantity >= 3 ? 2 : 1);
}

export function generateEncounterMaterialDrops(input: {
  seedKey: string;
  difficulty: EncounterDifficulty;
  candidates: LootCandidate[];
  monsters: EncounterMaterialMonster[];
  maxItems: number;
}): GeneratedLootPoolItem[] {
  if (input.maxItems <= 0 || input.monsters.length === 0) {
    return [];
  }

  const seed = hashSeed(
    `${input.seedKey}|${input.difficulty}|${input.monsters.length}|monster-materials`,
  );

  const ranked = input.monsters
    .map((monster, index) => {
      const explicitDrops = splitSpecialDrops(monster.specialDrops);
      const prefersBossMaterial =
        input.difficulty === EncounterDifficulty.BOSS ||
        (input.difficulty === EncounterDifficulty.DEADLY && monster.quantity >= 2);
      const materialName =
        explicitDrops[0] || inferFallbackMaterialName(monster, prefersBossMaterial);
      const candidate = findLootCandidateByName(input.candidates, materialName);
      const quantity = inferMonsterMaterialQuantity(
        input.difficulty,
        monster.quantity,
        prefersBossMaterial,
      );
      const score =
        (explicitDrops.length > 0 ? -10_000 : 0) -
        monster.quantity * 100 +
        (prefersBossMaterial ? -500 : 0) +
        (hashSeed(`${seed}|${materialName}|${monster.name}|${index}`) % 997);

      return {
        materialName,
        score,
        item: {
          lootItemId: candidate?.id ?? null,
          itemNameSnapshot: candidate?.name ?? materialName,
          raritySnapshot:
            candidate?.rarity ??
            inferMaterialRarity(
              input.difficulty,
              prefersBossMaterial,
              explicitDrops.length > 0,
            ),
          kindSnapshot: candidate?.kind ?? LootKind.TREASURE,
          quantity,
          resolutionMetadata:
            explicitDrops.length > 0
              ? `Monster material from ${monster.name}: ${materialName}.`
              : `Monster material from ${monster.name} (${monster.monsterType}).`,
        },
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.materialName.localeCompare(right.materialName);
    });

  const deduped = new Map<string, GeneratedLootPoolItem>();

  for (const entry of ranked) {
    const key = normalizeText(entry.item.itemNameSnapshot);
    const current = deduped.get(key);

    if (current) {
      current.quantity = Math.min(3, current.quantity + entry.item.quantity);
      continue;
    }

    deduped.set(key, { ...entry.item });

    if (deduped.size >= input.maxItems) {
      break;
    }
  }

  return Array.from(deduped.values()).slice(0, input.maxItems);
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

export function buildLootPoolDraft(input: {
  campaignId: string;
  campaignName: string;
  candidates: LootCandidate[];
  characterLevels: number[];
  encounter: LootPoolDraftEncounter | null;
  overrides: {
    title?: string;
    sourceText?: string;
    partyLevel?: number;
    difficulty?: EncounterDifficulty;
    itemCount?: number;
    includeMonsterMaterials?: boolean;
    notes?: string;
  };
}): LootPoolDraft {
  const fallbackPartyLevel =
    input.characterLevels.length > 0
      ? Math.max(
          1,
          Math.round(
            input.characterLevels.reduce((sum, level) => sum + level, 0) /
              input.characterLevels.length,
          ),
        )
      : 1;

  const resolvedPartyLevel =
    input.overrides.partyLevel ?? input.encounter?.partyLevel ?? fallbackPartyLevel;
  const resolvedDifficulty =
    input.overrides.difficulty ?? input.encounter?.difficulty ?? EncounterDifficulty.MEDIUM;
  const resolvedTitle =
    input.overrides.title?.trim() ||
    input.encounter?.title ||
    `${input.campaignName} reward pool`;
  const resolvedSourceText =
    input.overrides.sourceText?.trim() ||
    (input.encounter
      ? `Encounter reward for ${input.encounter.title}.`
      : "Generated reward pool.");
  const notes = input.overrides.notes?.trim() || null;
  const seedKey =
    input.encounter?.id ??
    `${resolvedTitle}|${resolvedSourceText}|${notes ?? ""}|${resolvedPartyLevel}|${resolvedDifficulty}`;
  const requestedItemCount =
    input.overrides.itemCount ??
    computeLootGenerationProfile(resolvedPartyLevel, resolvedDifficulty).itemCount;
  const materialItemBudget =
    input.encounter && input.overrides.includeMonsterMaterials
      ? Math.min(
          requestedItemCount,
          resolvedDifficulty === EncounterDifficulty.BOSS ? 2 : 1,
        )
      : 0;
  const materialItems =
    input.encounter && materialItemBudget > 0
      ? generateEncounterMaterialDrops({
          seedKey,
          difficulty: resolvedDifficulty,
          candidates: input.candidates,
          monsters: input.encounter.monsters.map((slot) => ({
            name: slot.monster.name,
            monsterType: slot.monster.monsterType,
            tags: slot.monster.tags,
            specialDrops: slot.monster.specialDrops,
            quantity: slot.quantity,
          })),
          maxItems: materialItemBudget,
        })
      : [];
  const materialItemNames = new Set(
    materialItems.map((item) => item.itemNameSnapshot.trim().toLowerCase()),
  );
  const standardCandidates =
    materialItemNames.size > 0
      ? input.candidates.filter(
          (candidate) => !materialItemNames.has(candidate.name.trim().toLowerCase()),
        )
      : input.candidates;
  const standardItemBudget = Math.max(0, requestedItemCount - materialItems.length);
  const standardItems =
    standardCandidates.length > 0 && standardItemBudget > 0
      ? generateLootPoolItems({
          campaignId: input.campaignId,
          seedKey,
          partyLevel: resolvedPartyLevel,
          difficulty: resolvedDifficulty,
          candidates: standardCandidates,
          maxItems: standardItemBudget,
        })
      : [];

  return {
    encounterId: input.encounter?.id ?? null,
    title: resolvedTitle,
    sourceText: resolvedSourceText,
    notes,
    partyLevel: resolvedPartyLevel,
    difficulty: resolvedDifficulty,
    distributionMode: input.encounter ? "ROLL" : "ASSIGN",
    items: [...materialItems, ...standardItems],
  };
}
