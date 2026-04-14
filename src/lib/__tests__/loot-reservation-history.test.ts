import { describe, expect, it } from "vitest";
import {
  filterLootReservationHistoryByCharacter,
  formatLootReservationHistoryDetail,
  formatLootReservationHistoryHeadline,
  getRecentLootReservationEvents,
  mapLootReservationHistoryItem,
} from "@/lib/loot-reservation-history";

describe("loot reservation history helpers", () => {
  const entries = [
    {
      id: "event-1",
      eventType: "RESERVED",
      note: "Item reserved for Miri Vale.",
      createdAt: new Date("2026-04-14T02:00:00.000Z"),
      character: { id: "char-1", name: "Miri Vale" },
      lootPoolItem: {
        id: "item-1",
        itemNameSnapshot: "Sunforged Band",
        quantity: 1,
        lootPool: {
          title: "Sunken Shrine Spoils",
        },
      },
    },
    {
      id: "event-2",
      eventType: "CLEARED",
      note: "Reservation for Miri Vale was cleared.",
      createdAt: new Date("2026-04-14T01:00:00.000Z"),
      character: { id: "char-1", name: "Miri Vale" },
      lootPoolItem: {
        id: "item-1",
        itemNameSnapshot: "Sunforged Band",
        quantity: 1,
        lootPool: {
          title: "Sunken Shrine Spoils",
        },
      },
    },
  ];

  it("sorts reservation events newest first", () => {
    expect(getRecentLootReservationEvents(entries).map((entry) => entry.id)).toEqual([
      "event-1",
      "event-2",
    ]);
  });

  it("formats readable reservation history text", () => {
    expect(formatLootReservationHistoryHeadline(entries[0].lootPoolItem)).toBe(
      "Sunforged Band × 1",
    );
    expect(formatLootReservationHistoryDetail(entries[0])).toBe(
      "Sunken Shrine Spoils · Miri Vale",
    );
  });

  it("maps and filters history items by character", () => {
    const mapped = entries.map(mapLootReservationHistoryItem);

    expect(mapped[0]?.tags).toEqual(["RESERVED"]);
    expect(
      filterLootReservationHistoryByCharacter(mapped, "char-1").map((entry) => entry.id),
    ).toEqual(["event-1", "event-2"]);
    expect(filterLootReservationHistoryByCharacter(mapped, "char-2")).toEqual([]);
  });
});
