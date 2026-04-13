type PlayerLootRollEntry = {
  characterId: string;
  rollTotal: number | null;
  status: string;
};

type PlayerLootPoolItem = {
  status: string;
  distributionMode: string;
  awardedCharacter: { id: string; name: string } | null;
  resolutionMetadata?: string | null;
  rollEntries: PlayerLootRollEntry[];
};

export type PlayerLootItemProgress = {
  key:
    | "action-needed"
    | "awaiting-resolution"
    | "assigned-to-you"
    | "assigned-to-other"
    | "banked"
    | "open"
    | "resolved";
  headline: string;
  detail: string;
  myRoll: PlayerLootRollEntry | null;
};

export type PlayerLootPoolProgress = {
  actionNeeded: number;
  awaitingResolution: number;
  assignedToYou: number;
  banked: number;
};

export function getPlayerLootItemProgress(input: {
  accountId: string;
  item: PlayerLootPoolItem;
}): PlayerLootItemProgress {
  const myRoll =
    input.item.rollEntries.find((entry) => entry.characterId === input.accountId) ?? null;
  const awardedToYou = input.item.awardedCharacter?.id === input.accountId;

  if (
    input.item.status === "UNRESOLVED" &&
    input.item.distributionMode === "ROLL" &&
    !myRoll
  ) {
    return {
      key: "action-needed",
      headline: "Action needed",
      detail: "Roll or pass before the DM closes this item.",
      myRoll: null,
    };
  }

  if (input.item.status === "UNRESOLVED" && myRoll) {
    return {
      key: "awaiting-resolution",
      headline: "Awaiting party resolution",
      detail: `Your response is locked in. ${input.item.rollEntries.length} party response(s) recorded so far.`,
      myRoll,
    };
  }

  if (awardedToYou) {
    return {
      key: "assigned-to-you",
      headline: "Assigned to you",
      detail: "Check your bank or inventory ledger for the final destination.",
      myRoll,
    };
  }

  if (input.item.awardedCharacter) {
    return {
      key: "assigned-to-other",
      headline: `Assigned to ${input.item.awardedCharacter.name}`,
      detail: "This item has already left the shared pool.",
      myRoll,
    };
  }

  if (input.item.status === "BANKED") {
    return {
      key: "banked",
      headline: "Banked for later",
      detail: "This item is parked for later party distribution.",
      myRoll,
    };
  }

  if (input.item.status === "UNRESOLVED") {
    return {
      key: "open",
      headline: "Still unresolved",
      detail: "The party or DM has not resolved this item yet.",
      myRoll,
    };
  }

  return {
    key: "resolved",
    headline: "Resolved",
    detail: input.item.resolutionMetadata?.trim() || "This item is no longer open.",
    myRoll,
  };
}

export function summarizePlayerLootPool(input: {
  accountId: string;
  items: PlayerLootPoolItem[];
}): PlayerLootPoolProgress {
  return input.items.reduce<PlayerLootPoolProgress>(
    (summary, item) => {
      const progress = getPlayerLootItemProgress({
        accountId: input.accountId,
        item,
      });

      if (progress.key === "action-needed") {
        summary.actionNeeded += 1;
      } else if (progress.key === "awaiting-resolution") {
        summary.awaitingResolution += 1;
      } else if (progress.key === "assigned-to-you") {
        summary.assignedToYou += 1;
      } else if (progress.key === "banked") {
        summary.banked += 1;
      }

      return summary;
    },
    {
      actionNeeded: 0,
      awaitingResolution: 0,
      assignedToYou: 0,
      banked: 0,
    },
  );
}
