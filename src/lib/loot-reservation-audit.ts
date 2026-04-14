import {
  parseLootClaimInterestNames,
  parseLootReservedCharacterName,
} from "@/lib/loot-progress";

type LootReservationItem = {
  id: string;
  itemNameSnapshot: string;
  quantity: number;
  resolutionMetadata?: string | null;
  resolutionNote?: string | null;
  updatedAt: Date;
  lootPool: {
    title: string;
    sourceText?: string | null;
    encounter?: { title: string } | null;
  };
};

export type ActiveLootReservation = {
  id: string;
  itemName: string;
  quantity: number;
  reservedForName: string;
  claimInterestNames: string[];
  reservedAt: Date;
  detail: string;
  source: string;
};

export function getActiveLootReservations<T extends LootReservationItem>(items: T[]) {
  return items
    .map<ActiveLootReservation | null>((item) => {
      const reservedForName = parseLootReservedCharacterName(item.resolutionMetadata);

      if (!reservedForName) {
        return null;
      }

      const claimInterestNames = parseLootClaimInterestNames(item.resolutionMetadata);
      const source =
        item.lootPool.encounter?.title ??
        item.lootPool.sourceText?.trim() ??
        item.lootPool.title;
      const detail =
        item.resolutionNote?.trim() ||
        `Reserved for ${reservedForName} pending final delivery.`;

      return {
        id: item.id,
        itemName: item.itemNameSnapshot,
        quantity: item.quantity,
        reservedForName,
        claimInterestNames,
        reservedAt: item.updatedAt,
        detail,
        source,
      };
    })
    .filter((item): item is ActiveLootReservation => item !== null)
    .sort((left, right) => right.reservedAt.getTime() - left.reservedAt.getTime());
}

export function formatLootReservationHeadline(input: {
  itemName: string;
  quantity: number;
}) {
  return `${input.itemName} × ${input.quantity}`;
}

export function formatLootReservationDetail(reservation: ActiveLootReservation) {
  return `${reservation.reservedForName} · ${reservation.source}`;
}
