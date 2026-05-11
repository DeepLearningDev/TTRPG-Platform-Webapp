import type { PlayerLootItemProgress } from "@/lib/loot-progress";

type PlayerLootRollEntry = {
  characterId: string;
};

type PlayerLootPoolItem = {
  status: string;
  distributionMode: string;
  awardedCharacter: { id: string } | null;
  rollEntries: PlayerLootRollEntry[];
};

export function canPlayerRespondToLootPoolItem(input: {
  accountId: string;
  item: PlayerLootPoolItem;
}) {
  const myRoll = input.item.rollEntries.find(
    (entry) => entry.characterId === input.accountId,
  );

  return (
    input.item.status === "UNRESOLVED" &&
    input.item.distributionMode === "ROLL" &&
    !myRoll &&
    !input.item.awardedCharacter
  );
}

export function canPlayerMarkLootClaimInterest(input: {
  progress: PlayerLootItemProgress;
}) {
  return input.progress.key === "banked" && !input.progress.reservedForName;
}
