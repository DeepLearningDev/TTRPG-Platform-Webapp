import { describe, expect, it } from "vitest";
import {
  buildLootHistorySections,
  filterLootAwardsByDestination,
  filterLootAwardsByRecipient,
  filterLootAwardsBySource,
  filterLootReservationsByRecipient,
  getLootHistoryDestinationCounts,
  getLootHistorySourceCounts,
  parseLootHistoryRecipientFilter,
  parseLootHistoryDestinationFilter,
  parseLootHistorySourceFilter,
} from "@/lib/loot-history";

describe("loot history sections", () => {
  const reservations = [
    {
      id: "reserve-1",
      itemName: "Sunforged Band",
      quantity: 1,
      reservedForName: "Miri Vale",
      claimInterestNames: ["Miri Vale", "Toren Ash"],
      reservedAt: new Date("2026-04-13T22:10:00.000Z"),
      detail: "Reserved for Miri Vale pending final delivery.",
      source: "Sunken Shrine",
    },
  ];

  const awards = [
    {
      id: "award-1",
      createdAt: new Date("2026-04-13T23:10:00.000Z"),
      scope: "BANK",
      entryType: "AWARD",
      quantity: 1,
      goldDelta: 0,
      note: "Approved Miri Vale's claim and sent item to Bank.",
      lootItem: { name: "Sunforged Band" },
      character: { name: "Miri Vale" },
    },
    {
      id: "award-2",
      createdAt: new Date("2026-04-13T21:10:00.000Z"),
      scope: "INVENTORY",
      entryType: "AWARD",
      quantity: 1,
      goldDelta: 0,
      note: "Sunken Shrine Spoils: Roll-off: Miri Vale 18, Toren Ash 12. Winner: Miri Vale.",
      lootItem: { name: "Moonlit Compass" },
      character: { name: "Miri Vale" },
    },
  ];

  it("groups reservation, claim-approved, and other delivery history", () => {
    const sections = buildLootHistorySections({
      awards,
      reservations,
    });

    expect(sections.map((section) => [section.key, section.count])).toEqual([
      ["reserved", 1],
      ["claim-approved", 1],
      ["delivered", 1],
    ]);

    expect(sections[0]?.items[0]?.tags).toEqual([
      "Reserved now",
      "Miri Vale",
      "2 interested",
    ]);
    expect(sections[1]?.items[0]?.tags).toEqual([
      "Claim approved",
      "Miri Vale",
    ]);
    expect(sections[2]?.items[0]?.tags).toEqual([
      "Party roll",
      "Miri Vale",
    ]);
  });

  it("filters awards by destination", () => {
    expect(parseLootHistoryDestinationFilter("bank")).toBe("bank");
    expect(parseLootHistoryDestinationFilter("inventory")).toBe("inventory");
    expect(parseLootHistoryDestinationFilter("weird")).toBe("all");
    expect(filterLootAwardsByDestination(awards, "bank").map((entry) => entry.id)).toEqual([
      "award-1",
    ]);
    expect(filterLootAwardsByDestination(awards, "inventory").map((entry) => entry.id)).toEqual([
      "award-2",
    ]);
    expect(getLootHistoryDestinationCounts(awards)).toEqual({
      all: 2,
      bank: 1,
      inventory: 1,
    });
  });

  it("filters history by recipient name", () => {
    expect(parseLootHistoryRecipientFilter("miri vale", ["Miri Vale", "Toren Ash"])).toBe(
      "Miri Vale",
    );
    expect(parseLootHistoryRecipientFilter("unknown", ["Miri Vale", "Toren Ash"])).toBe("all");
    expect(filterLootAwardsByRecipient(awards, "Miri Vale").map((entry) => entry.id)).toEqual([
      "award-1",
      "award-2",
    ]);
    expect(filterLootAwardsByRecipient(awards, "Toren Ash")).toEqual([]);
    expect(
      filterLootReservationsByRecipient(reservations, "Miri Vale").map((entry) => entry.id),
    ).toEqual(["reserve-1"]);
  });

  it("filters awards by source label", () => {
    expect(parseLootHistorySourceFilter("Party roll")).toBe("Party roll");
    expect(parseLootHistorySourceFilter("weird")).toBe("all");
    expect(filterLootAwardsBySource(awards, "Claim approved").map((entry) => entry.id)).toEqual([
      "award-1",
    ]);
    expect(filterLootAwardsBySource(awards, "Party roll").map((entry) => entry.id)).toEqual([
      "award-2",
    ]);
    expect(getLootHistorySourceCounts(awards)).toEqual({
      all: 2,
      claimApproved: 1,
      partyRoll: 1,
      directAssignment: 0,
      manualAward: 0,
    });
  });
});
