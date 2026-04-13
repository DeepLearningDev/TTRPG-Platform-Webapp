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
  claimInterestNames: string[];
  hasClaimInterest: boolean;
};

export type PlayerLootPoolProgress = {
  actionNeeded: number;
  awaitingResolution: number;
  assignedToYou: number;
  banked: number;
  claimInterest: number;
};

function normalizeClaimName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseLootClaimInterestNames(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const prefix = "claim interest:";
  const normalized = value.trim();

  if (!normalized.toLowerCase().startsWith(prefix)) {
    return [];
  }

  const body = normalized.slice(prefix.length).trim().replace(/\.$/, "");

  if (!body) {
    return [];
  }

  const deduped = new Map<string, string>();

  for (const name of body.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    const key = normalizeClaimName(name);

    if (!key || deduped.has(key)) {
      continue;
    }

    deduped.set(key, name);
  }

  return Array.from(deduped.values());
}

export function prioritizeInterestedCharacters<T extends { id: string; name: string }>(input: {
  names: string[];
  characters: T[];
}) {
  const interestedCharacters = input.names
    .map((name) =>
      input.characters.find(
        (character) => normalizeClaimName(character.name) === normalizeClaimName(name),
      ) ?? null,
    )
    .filter((character): character is T => character !== null);

  if (interestedCharacters.length === 0) {
    return {
      interestedCharacters: [],
      orderedCharacters: input.characters,
    };
  }

  return {
    interestedCharacters,
    orderedCharacters: [
      ...interestedCharacters,
      ...input.characters.filter(
        (character) =>
          !interestedCharacters.some((interested) => interested.id === character.id),
      ),
    ],
  };
}

export function formatLootClaimInterestMetadata(names: string[]) {
  const uniqueNames = parseLootClaimInterestNames(`Claim interest: ${names.join(", ")}`);

  if (uniqueNames.length === 0) {
    return null;
  }

  return `Claim interest: ${uniqueNames.join(", ")}.`;
}

export function toggleLootClaimInterest(input: {
  metadata: string | null | undefined;
  actorName: string;
  interested: boolean;
}) {
  const current = parseLootClaimInterestNames(input.metadata);
  const actorKey = normalizeClaimName(input.actorName);
  const next = input.interested
    ? current.some((name) => normalizeClaimName(name) === actorKey)
      ? current
      : [...current, input.actorName.trim()]
    : current.filter((name) => normalizeClaimName(name) !== actorKey);

  return formatLootClaimInterestMetadata(next);
}

export function getPlayerLootItemProgress(input: {
  accountId: string;
  actorName?: string;
  item: PlayerLootPoolItem;
}): PlayerLootItemProgress {
  const myRoll =
    input.item.rollEntries.find((entry) => entry.characterId === input.accountId) ?? null;
  const awardedToYou = input.item.awardedCharacter?.id === input.accountId;
  const claimInterestNames = parseLootClaimInterestNames(input.item.resolutionMetadata);
  const actorName = input.actorName?.trim();
  const hasClaimInterest = actorName
    ? claimInterestNames.some((name) => normalizeClaimName(name) === normalizeClaimName(actorName))
    : false;

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
      claimInterestNames,
      hasClaimInterest,
    };
  }

  if (input.item.status === "UNRESOLVED" && myRoll) {
    return {
      key: "awaiting-resolution",
      headline: "Awaiting party resolution",
      detail: `Your response is locked in. ${input.item.rollEntries.length} party response(s) recorded so far.`,
      myRoll,
      claimInterestNames,
      hasClaimInterest,
    };
  }

  if (awardedToYou) {
    return {
      key: "assigned-to-you",
      headline: "Assigned to you",
      detail:
        input.item.resolutionMetadata?.trim() ||
        "Check your bank or inventory ledger for the final destination.",
      myRoll,
      claimInterestNames,
      hasClaimInterest,
    };
  }

  if (input.item.awardedCharacter) {
    return {
      key: "assigned-to-other",
      headline: `Assigned to ${input.item.awardedCharacter.name}`,
      detail:
        input.item.resolutionMetadata?.trim() ||
        "This item has already left the shared pool.",
      myRoll,
      claimInterestNames,
      hasClaimInterest,
    };
  }

  if (input.item.status === "BANKED") {
    const detail =
      claimInterestNames.length > 0
        ? `Interested players: ${claimInterestNames.join(", ")}.`
        : "No party member has marked interest yet.";

    return {
      key: "banked",
      headline: "Banked for later",
      detail,
      myRoll,
      claimInterestNames,
      hasClaimInterest,
    };
  }

  if (input.item.status === "UNRESOLVED") {
    return {
      key: "open",
      headline: "Still unresolved",
      detail: "The party or DM has not resolved this item yet.",
      myRoll,
      claimInterestNames,
      hasClaimInterest,
    };
  }

  return {
    key: "resolved",
    headline: "Resolved",
    detail: input.item.resolutionMetadata?.trim() || "This item is no longer open.",
    myRoll,
    claimInterestNames,
    hasClaimInterest,
  };
}

export function summarizePlayerLootPool(input: {
  accountId: string;
  actorName?: string;
  items: PlayerLootPoolItem[];
}): PlayerLootPoolProgress {
  return input.items.reduce<PlayerLootPoolProgress>(
    (summary, item) => {
      const progress = getPlayerLootItemProgress({
        accountId: input.accountId,
        actorName: input.actorName,
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

      if (progress.hasClaimInterest) {
        summary.claimInterest += 1;
      }

      return summary;
    },
    {
      actionNeeded: 0,
      awaitingResolution: 0,
      assignedToYou: 0,
      banked: 0,
      claimInterest: 0,
    },
  );
}
