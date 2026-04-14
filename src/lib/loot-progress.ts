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
    | "reserved-for-you"
    | "assigned-to-you"
    | "assigned-to-other"
    | "banked"
    | "open"
    | "resolved";
  headline: string;
  detail: string;
  myRoll: PlayerLootRollEntry | null;
  claimInterestNames: string[];
  reservedForName: string | null;
  hasClaimInterest: boolean;
};

export type PlayerLootPoolProgress = {
  actionNeeded: number;
  awaitingResolution: number;
  reservedForYou: number;
  assignedToYou: number;
  banked: number;
  claimInterest: number;
};

function normalizeClaimName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseMetadataSentence(value: string | null | undefined, label: string) {
  if (!value) {
    return null;
  }

  const match = value.match(new RegExp(`${label}:\\s*(.+?)(?:\\.|$)`, "i"));
  const parsed = match?.[1]?.trim();

  return parsed ? parsed : null;
}

export function parseLootReservedCharacterName(value: string | null | undefined) {
  return parseMetadataSentence(value, "Reserved for");
}

export function parseLootClaimInterestNames(value: string | null | undefined) {
  const body = parseMetadataSentence(value, "Claim interest");

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

export function formatLootClaimStateMetadata(input: {
  reservedForName?: string | null;
  claimInterestNames?: string[];
}) {
  const parts: string[] = [];
  const reservedForName = input.reservedForName?.trim();
  const claimInterestNames = parseLootClaimInterestNames(
    input.claimInterestNames?.length
      ? `Claim interest: ${input.claimInterestNames.join(", ")}`
      : null,
  );

  if (reservedForName) {
    parts.push(`Reserved for: ${reservedForName}.`);
  }

  if (claimInterestNames.length > 0) {
    parts.push(`Claim interest: ${claimInterestNames.join(", ")}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export function formatLootClaimInterestMetadata(names: string[]) {
  return formatLootClaimStateMetadata({
    claimInterestNames: names,
  });
}

export function toggleLootClaimInterest(input: {
  metadata: string | null | undefined;
  actorName: string;
  interested: boolean;
}) {
  const current = parseLootClaimInterestNames(input.metadata);
  const reservedForName = parseLootReservedCharacterName(input.metadata);
  const actorKey = normalizeClaimName(input.actorName);
  const next = input.interested
    ? current.some((name) => normalizeClaimName(name) === actorKey)
      ? current
      : [...current, input.actorName.trim()]
    : current.filter((name) => normalizeClaimName(name) !== actorKey);

  return formatLootClaimStateMetadata({
    reservedForName,
    claimInterestNames: next,
  });
}

export function setLootClaimReservation(input: {
  metadata: string | null | undefined;
  reservedForName: string | null | undefined;
}) {
  return formatLootClaimStateMetadata({
    reservedForName: input.reservedForName,
    claimInterestNames: parseLootClaimInterestNames(input.metadata),
  });
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
  const reservedForName = parseLootReservedCharacterName(input.item.resolutionMetadata);
  const actorName = input.actorName?.trim();
  const hasClaimInterest = actorName
    ? claimInterestNames.some((name) => normalizeClaimName(name) === normalizeClaimName(actorName))
    : false;
  const reservedForYou =
    actorName && reservedForName
      ? normalizeClaimName(reservedForName) === normalizeClaimName(actorName)
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
      reservedForName,
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
      reservedForName,
      hasClaimInterest,
    };
  }

  if (input.item.status === "BANKED" && reservedForYou) {
    return {
      key: "reserved-for-you",
      headline: "Reserved for you",
      detail: "The DM reserved this banked item for you until final delivery.",
      myRoll,
      claimInterestNames,
      reservedForName,
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
      reservedForName,
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
      reservedForName,
      hasClaimInterest,
    };
  }

  if (input.item.status === "BANKED") {
    const detail = reservedForName
      ? `Reserved for ${reservedForName} until the DM finishes delivery.`
      : claimInterestNames.length > 0
        ? `Interested players: ${claimInterestNames.join(", ")}.`
        : "No party member has marked interest yet.";

    return {
      key: "banked",
      headline: reservedForName ? `Reserved for ${reservedForName}` : "Banked for later",
      detail,
      myRoll,
      claimInterestNames,
      reservedForName,
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
      reservedForName,
      hasClaimInterest,
    };
  }

  return {
    key: "resolved",
    headline: "Resolved",
    detail: input.item.resolutionMetadata?.trim() || "This item is no longer open.",
    myRoll,
    claimInterestNames,
    reservedForName,
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
      } else if (progress.key === "reserved-for-you") {
        summary.reservedForYou += 1;
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
      reservedForYou: 0,
      assignedToYou: 0,
      banked: 0,
      claimInterest: 0,
    },
  );
}
