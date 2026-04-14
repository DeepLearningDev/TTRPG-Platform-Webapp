import { describe, expect, it } from "vitest";
import {
  formatLootAuditDate,
  formatLootAuditDetail,
  formatLootAuditHeadline,
  getLootAuditSource,
  getRecentLootAwardEntries,
} from "@/lib/loot-audit";

describe("loot audit helpers", () => {
  const awardEntry = {
    id: "entry-1",
    createdAt: new Date("2026-04-13T19:30:00.000Z"),
    scope: "BANK",
    entryType: "AWARD",
    quantity: 1,
    goldDelta: 0,
    note: "Approved Miri Vale's claim and sent item to Bank.",
    lootItem: {
      name: "Sunforged Band",
    },
    character: {
      name: "Miri Vale",
    },
  };

  it("keeps only award entries", () => {
    expect(
      getRecentLootAwardEntries([
        awardEntry,
        {
          ...awardEntry,
          id: "entry-2",
          entryType: "DEPOSIT",
        },
      ]),
    ).toEqual([awardEntry]);
  });

  it("formats a readable headline and detail", () => {
    expect(formatLootAuditHeadline(awardEntry)).toBe("Sunforged Band × 1");
    expect(formatLootAuditDetail(awardEntry)).toBe("Miri Vale · Bank");
  });

  it("formats a readable date label", () => {
    expect(formatLootAuditDate(awardEntry.createdAt)).toContain("Apr");
  });

  it("classifies claim approvals and roll awards", () => {
    expect(getLootAuditSource(awardEntry)).toEqual({
      label: "Claim approved",
      detail: "Miri Vale",
    });

    expect(
      getLootAuditSource({
        ...awardEntry,
        note: "Sunken Shrine Spoils: Roll-off: Miri Vale 18, Toren Ash 12. Winner: Miri Vale.",
      }),
    ).toEqual({
      label: "Party roll",
      detail: "Miri Vale",
    });
  });
});
