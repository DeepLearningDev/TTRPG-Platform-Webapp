import { describe, expect, it } from "vitest";
import {
  formatLootReservationDetail,
  formatLootReservationHeadline,
  getActiveLootReservations,
} from "@/lib/loot-reservation-audit";

describe("loot reservation audit helpers", () => {
  const reservedItem = {
    id: "item-1",
    itemNameSnapshot: "Sunforged Band",
    quantity: 1,
    resolutionMetadata: "Reserved for: Miri Vale. Claim interest: Miri Vale, Toren Ash.",
    resolutionNote: "Reserved for Miri Vale pending final delivery.",
    updatedAt: new Date("2026-04-13T22:10:00.000Z"),
    lootPool: {
      title: "Sunken Shrine Spoils",
      sourceText: "Session reward",
      encounter: {
        title: "Sunken Shrine",
      },
    },
  };

  it("keeps only actively reserved items and sorts them newest first", () => {
    const results = getActiveLootReservations([
      reservedItem,
      {
        ...reservedItem,
        id: "item-2",
        resolutionMetadata: "Claim interest: Toren Ash.",
      },
      {
        ...reservedItem,
        id: "item-3",
        updatedAt: new Date("2026-04-13T23:10:00.000Z"),
        resolutionMetadata: "Reserved for: Sella Drift.",
      },
    ]);

    expect(results.map((item) => item.id)).toEqual(["item-3", "item-1"]);
  });

  it("formats readable reservation text", () => {
    const [reservation] = getActiveLootReservations([reservedItem]);

    expect(formatLootReservationHeadline(reservation)).toBe("Sunforged Band × 1");
    expect(formatLootReservationDetail(reservation)).toBe("Miri Vale · Sunken Shrine");
    expect(reservation.claimInterestNames).toEqual(["Miri Vale", "Toren Ash"]);
  });
});
