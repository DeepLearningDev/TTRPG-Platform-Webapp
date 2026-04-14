import {
  formatLootAuditDetail,
  formatLootAuditHeadline,
  getLootAuditSource,
} from "@/lib/loot-audit";
import {
  formatLootReservationDetail,
  formatLootReservationHeadline,
  type ActiveLootReservation,
} from "@/lib/loot-reservation-audit";

type LootAuditEntry = {
  id: string;
  createdAt: Date;
  scope: string;
  entryType: string;
  quantity: number;
  goldDelta: number;
  note: string;
  lootItem: { name: string } | null;
  character?: { name: string } | null;
};

export type LootHistoryItem = {
  id: string;
  headline: string;
  detail: string;
  note: string;
  happenedAt: Date;
  tags: string[];
};

export type LootHistorySection = {
  key: "reserved" | "claim-approved" | "delivered";
  title: string;
  count: number;
  items: LootHistoryItem[];
};

export function buildLootHistorySections(input: {
  awards: LootAuditEntry[];
  reservations: ActiveLootReservation[];
}): LootHistorySection[] {
  const reservedItems = input.reservations.map<LootHistoryItem>((reservation) => ({
    id: reservation.id,
    headline: formatLootReservationHeadline(reservation),
    detail: formatLootReservationDetail(reservation),
    note: reservation.detail,
    happenedAt: reservation.reservedAt,
    tags: [
      "Reserved now",
      reservation.reservedForName,
      ...(reservation.claimInterestNames.length > 0
        ? [`${reservation.claimInterestNames.length} interested`]
        : []),
    ],
  }));

  const claimApprovedItems = input.awards
    .filter((entry) => getLootAuditSource(entry).label === "Claim approved")
    .map<LootHistoryItem>((entry) => {
      const source = getLootAuditSource(entry);

      return {
        id: entry.id,
        headline: formatLootAuditHeadline(entry),
        detail: formatLootAuditDetail(entry),
        note: entry.note,
        happenedAt: entry.createdAt,
        tags: [source.label, ...(source.detail ? [source.detail] : [])],
      };
    });

  const deliveredItems = input.awards
    .filter((entry) => getLootAuditSource(entry).label !== "Claim approved")
    .map<LootHistoryItem>((entry) => {
      const source = getLootAuditSource(entry);

      return {
        id: entry.id,
        headline: formatLootAuditHeadline(entry),
        detail: formatLootAuditDetail(entry),
        note: entry.note,
        happenedAt: entry.createdAt,
        tags: [source.label, ...(source.detail ? [source.detail] : [])],
      };
    });

  return [
    {
      key: "reserved",
      title: "Reserved now",
      count: reservedItems.length,
      items: reservedItems,
    },
    {
      key: "claim-approved",
      title: "Claim approved",
      count: claimApprovedItems.length,
      items: claimApprovedItems,
    },
    {
      key: "delivered",
      title: "Other deliveries",
      count: deliveredItems.length,
      items: deliveredItems,
    },
  ];
}
