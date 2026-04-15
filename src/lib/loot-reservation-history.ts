type LootReservationEventRecord = {
  id: string;
  eventType: string;
  actorName: string | null;
  note: string;
  createdAt: Date;
  character: { id: string; name: string } | null;
  lootPoolItem: {
    id: string;
    itemNameSnapshot: string;
    quantity: number;
    lootPool: {
      title: string;
      sourceText?: string | null;
      encounter?: { title: string } | null;
    };
  };
};

export type LootReservationHistoryItem = {
  id: string;
  headline: string;
  detail: string;
  note: string;
  createdAt: Date;
  tags: string[];
  characterId: string | null;
  actorName: string | null;
};

function normalizeReservationHistorySource(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeReservationHistoryOperator(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeReservationHistoryRecipient(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getLootReservationHistorySource(entry: LootReservationEventRecord) {
  const sourceText = entry.lootPoolItem.lootPool.sourceText?.trim();

  if (sourceText) {
    return sourceText;
  }

  const encounterTitle = entry.lootPoolItem.lootPool.encounter?.title?.trim();

  if (encounterTitle) {
    return encounterTitle;
  }

  return entry.lootPoolItem.lootPool.title;
}

export function getRecentLootReservationEvents<T extends LootReservationEventRecord>(entries: T[]) {
  return [...entries].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function formatLootReservationHistoryHeadline(input: {
  itemNameSnapshot: string;
  quantity: number;
}) {
  return `${input.itemNameSnapshot} × ${input.quantity}`;
}

export function formatLootReservationHistoryDetail(entry: LootReservationEventRecord) {
  const parts = [entry.lootPoolItem.lootPool.title];

  if (entry.character?.name) {
    parts.push(entry.character.name);
  }

  if (entry.actorName) {
    parts.push(`by ${entry.actorName}`);
  }

  return parts.join(" · ");
}

export function mapLootReservationHistoryItem<T extends LootReservationEventRecord>(
  entry: T,
): LootReservationHistoryItem {
  return {
    id: entry.id,
    headline: formatLootReservationHistoryHeadline(entry.lootPoolItem),
    detail: formatLootReservationHistoryDetail(entry),
    note: entry.note,
    createdAt: entry.createdAt,
    tags: [entry.eventType.replace(/_/g, " ")],
    characterId: entry.character?.id ?? null,
    actorName: entry.actorName ?? null,
  };
}

export function filterLootReservationHistoryByCharacter<T extends LootReservationHistoryItem>(
  entries: T[],
  characterId: string | null,
) {
  if (!characterId) {
    return entries;
  }

  return entries.filter((entry) => entry.characterId === characterId);
}

export function filterLootReservationHistoryByRecipient<T extends LootReservationEventRecord>(
  entries: T[],
  recipient: string,
) {
  if (recipient === "all") {
    return entries;
  }

  return entries.filter(
    (entry) =>
      entry.character?.name &&
      normalizeReservationHistoryRecipient(entry.character.name) ===
        normalizeReservationHistoryRecipient(recipient),
  );
}

export function getLootReservationHistorySourceCounts<T extends LootReservationEventRecord>(
  entries: T[],
) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const source = getLootReservationHistorySource(entry);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return {
    all: entries.length,
    sources: [...counts.entries()].map(([source, count]) => ({ source, count })),
  };
}

export function parseLootReservationHistorySourceFilter(
  value: string | null | undefined,
  candidates: string[],
) {
  const normalized = value?.trim();

  if (!normalized) {
    return "all";
  }

  const matched =
    candidates.find(
      (candidate) =>
        normalizeReservationHistorySource(candidate) ===
        normalizeReservationHistorySource(normalized),
    ) ?? null;

  return matched ?? "all";
}

export function filterLootReservationHistoryBySource<T extends LootReservationEventRecord>(
  entries: T[],
  source: string,
) {
  if (source === "all") {
    return entries;
  }

  return entries.filter(
    (entry) =>
      normalizeReservationHistorySource(getLootReservationHistorySource(entry)) ===
      normalizeReservationHistorySource(source),
  );
}

export function getLootReservationHistoryOperatorCounts<T extends LootReservationEventRecord>(
  entries: T[],
) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const operator = entry.actorName?.trim();

    if (!operator) {
      continue;
    }

    counts.set(operator, (counts.get(operator) ?? 0) + 1);
  }

  return {
    all: entries.length,
    operators: [...counts.entries()].map(([operator, count]) => ({ operator, count })),
  };
}

export function parseLootReservationHistoryOperatorFilter(
  value: string | null | undefined,
  candidates: string[],
) {
  const normalized = value?.trim();

  if (!normalized) {
    return "all";
  }

  const matched =
    candidates.find(
      (candidate) =>
        normalizeReservationHistoryOperator(candidate) ===
        normalizeReservationHistoryOperator(normalized),
    ) ?? null;

  return matched ?? "all";
}

export function filterLootReservationHistoryByOperator<T extends LootReservationEventRecord>(
  entries: T[],
  operator: string,
) {
  if (operator === "all") {
    return entries;
  }

  return entries.filter(
    (entry) =>
      entry.actorName &&
      normalizeReservationHistoryOperator(entry.actorName) ===
        normalizeReservationHistoryOperator(operator),
  );
}
