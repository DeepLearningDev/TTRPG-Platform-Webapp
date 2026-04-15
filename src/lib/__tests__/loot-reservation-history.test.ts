import { describe, expect, it } from "vitest";
import {
  filterLootReservationHistoryBySource,
  filterLootReservationHistoryByCharacter,
  formatLootReservationHistoryDetail,
  formatLootReservationHistoryHeadline,
  getLootReservationHistorySource,
  getLootReservationHistorySourceCounts,
  getRecentLootReservationEvents,
  mapLootReservationHistoryItem,
  parseLootReservationHistorySourceFilter,
} from "@/lib/loot-reservation-history";

describe("loot reservation history helpers", () => {
  const entries = [
    {
      id: "event-1",
      eventType: "RESERVED",
      actorName: "dm",
      note: "Item reserved for Miri Vale.",
      createdAt: new Date("2026-04-14T02:00:00.000Z"),
      character: { id: "char-1", name: "Miri Vale" },
      lootPoolItem: {
        id: "item-1",
        itemNameSnapshot: "Sunforged Band",
        quantity: 1,
        lootPool: {
          title: "Sunken Shrine Spoils",
          sourceText: "Shrine cache",
          encounter: { title: "Shrine Depths" },
        },
      },
    },
    {
      id: "event-2",
      eventType: "CLEARED",
      actorName: "dm",
      note: "Reservation for Miri Vale was cleared.",
      createdAt: new Date("2026-04-14T01:00:00.000Z"),
      character: { id: "char-1", name: "Miri Vale" },
      lootPoolItem: {
        id: "item-1",
        itemNameSnapshot: "Sunforged Band",
        quantity: 1,
        lootPool: {
          title: "Sunken Shrine Spoils",
          sourceText: "Shrine cache",
          encounter: { title: "Shrine Depths" },
        },
      },
    },
    {
      id: "event-3",
      eventType: "AWARDED",
      actorName: "dm",
      note: "Reservation resolved to Talan Reed via direct assignment.",
      createdAt: new Date("2026-04-14T00:00:00.000Z"),
      character: { id: "char-2", name: "Talan Reed" },
      lootPoolItem: {
        id: "item-2",
        itemNameSnapshot: "Waveglass Charm",
        quantity: 1,
        lootPool: {
          title: "Wrecked Reliquary",
          sourceText: "",
          encounter: { title: "Harbor Wraith" },
        },
      },
    },
  ];

  it("sorts reservation events newest first", () => {
    expect(getRecentLootReservationEvents(entries).map((entry) => entry.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
    ]);
  });

  it("formats readable reservation history text", () => {
    expect(formatLootReservationHistoryHeadline(entries[0].lootPoolItem)).toBe(
      "Sunforged Band × 1",
    );
    expect(formatLootReservationHistoryDetail(entries[0])).toBe(
      "Sunken Shrine Spoils · Miri Vale · by dm",
    );
  });

  it("maps and filters history items by character", () => {
    const mapped = entries.map(mapLootReservationHistoryItem);

    expect(mapped[0]?.tags).toEqual(["RESERVED"]);
    expect(mapped[0]?.actorName).toBe("dm");
    expect(
      filterLootReservationHistoryByCharacter(mapped, "char-1").map((entry) => entry.id),
    ).toEqual(["event-1", "event-2"]);
    expect(filterLootReservationHistoryByCharacter(mapped, "char-2").map((entry) => entry.id)).toEqual([
      "event-3",
    ]);
  });

  it("derives reservation history sources and filters by them", () => {
    expect(getLootReservationHistorySource(entries[0])).toBe("Shrine cache");
    expect(getLootReservationHistorySource(entries[2])).toBe("Harbor Wraith");

    const counts = getLootReservationHistorySourceCounts(entries);

    expect(counts.all).toBe(3);
    expect(counts.sources).toEqual([
      { source: "Shrine cache", count: 2 },
      { source: "Harbor Wraith", count: 1 },
    ]);
    expect(
      parseLootReservationHistorySourceFilter("harbor wraith", counts.sources.map((entry) => entry.source)),
    ).toBe("Harbor Wraith");
    expect(filterLootReservationHistoryBySource(entries, "Shrine cache").map((entry) => entry.id)).toEqual([
      "event-1",
      "event-2",
    ]);
  });
});
