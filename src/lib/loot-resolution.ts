import { LootPoolRollStatus } from "@prisma/client";

export type LootRollSettlementCharacter = {
  id: string;
  name: string;
  level: number;
};

export type ExistingLootPoolRollEntry = {
  id: string;
  characterId: string;
  rollTotal: number | null;
  status: LootPoolRollStatus;
};

export type PlannedLootPoolRollEntry = {
  id: string;
  status: LootPoolRollStatus;
};

export type PlannedLootPoolRollSettlement = {
  winner: LootRollSettlementCharacter;
  rolls: Array<LootRollSettlementCharacter & { roll: number }>;
  summary: string;
  entries: PlannedLootPoolRollEntry[];
};

export function planLootPoolRollSettlement(input: {
  characters: LootRollSettlementCharacter[];
  rollEntries: ExistingLootPoolRollEntry[];
}): PlannedLootPoolRollSettlement | null {
  const charactersById = new Map(
    input.characters.map((character) => [character.id, character]),
  );

  const rolledEntries = input.rollEntries
    .filter(
      (entry) =>
        entry.status === LootPoolRollStatus.ROLLED &&
        entry.rollTotal !== null &&
        charactersById.has(entry.characterId),
    )
    .map((entry) => {
      const character = charactersById.get(entry.characterId);

      if (!character) {
        throw new Error("Rolled entry character lookup failed");
      }

      return {
        entry,
        character,
        roll: entry.rollTotal ?? 0,
      };
    })
    .sort((left, right) => {
      if (right.roll !== left.roll) {
        return right.roll - left.roll;
      }

      if (right.character.level !== left.character.level) {
        return right.character.level - left.character.level;
      }

      return left.character.name.localeCompare(right.character.name);
    });

  if (rolledEntries.length === 0) {
    return null;
  }

  const winner = rolledEntries[0];
  const rolls = rolledEntries.map(({ character, roll }) => ({
    ...character,
    roll,
  }));
  const summary = rolls.map((entry) => `${entry.name} ${entry.roll}`).join(", ");

  return {
    winner: winner.character,
    rolls,
    summary: `Roll-off: ${summary}. Winner: ${winner.character.name}.`,
    entries: input.rollEntries.map((entry) => {
      if (entry.status === LootPoolRollStatus.PASSED) {
        return {
          id: entry.id,
          status: LootPoolRollStatus.PASSED,
        };
      }

      if (entry.status === LootPoolRollStatus.ROLLED && entry.rollTotal !== null) {
        return {
          id: entry.id,
          status:
            entry.characterId === winner.character.id
              ? LootPoolRollStatus.WON
              : LootPoolRollStatus.LOST,
        };
      }

      return {
        id: entry.id,
        status: entry.status,
      };
    }),
  };
}
