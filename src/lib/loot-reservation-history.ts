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
