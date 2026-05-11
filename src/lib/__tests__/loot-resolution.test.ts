import { describe, expect, it } from "vitest";
import { LootPoolRollStatus } from "@prisma/client";
import { planLootPoolRollSettlement } from "@/lib/loot-resolution";

const characters = [
  { id: "c1", name: "Miri", level: 5 },
  { id: "c2", name: "Toren", level: 4 },
  { id: "c3", name: "Sella", level: 6 },
];

describe("planLootPoolRollSettlement", () => {
  it("settles existing rolled entries while preserving passed entries", () => {
    const result = planLootPoolRollSettlement({
      characters,
      rollEntries: [
        {
          id: "r1",
          characterId: "c1",
          rollTotal: 12,
          status: LootPoolRollStatus.ROLLED,
        },
        {
          id: "r2",
          characterId: "c2",
          rollTotal: 17,
          status: LootPoolRollStatus.ROLLED,
        },
        {
          id: "r3",
          characterId: "c3",
          rollTotal: null,
          status: LootPoolRollStatus.PASSED,
        },
      ],
    });

    expect(result?.winner).toMatchObject({ id: "c2", name: "Toren" });
    expect(result?.rolls.map((entry) => [entry.name, entry.roll])).toEqual([
      ["Toren", 17],
      ["Miri", 12],
    ]);
    expect(result?.entries).toEqual([
      { id: "r1", status: LootPoolRollStatus.LOST },
      { id: "r2", status: LootPoolRollStatus.WON },
      { id: "r3", status: LootPoolRollStatus.PASSED },
    ]);
    expect(result?.summary).toBe("Roll-off: Toren 17, Miri 12. Winner: Toren.");
  });

  it("breaks tied rolled totals by level then name", () => {
    const result = planLootPoolRollSettlement({
      characters: [
        { id: "c1", name: "Miri", level: 5 },
        { id: "c2", name: "Toren", level: 5 },
        { id: "c3", name: "Sella", level: 6 },
      ],
      rollEntries: [
        {
          id: "r1",
          characterId: "c1",
          rollTotal: 18,
          status: LootPoolRollStatus.ROLLED,
        },
        {
          id: "r2",
          characterId: "c2",
          rollTotal: 18,
          status: LootPoolRollStatus.ROLLED,
        },
        {
          id: "r3",
          characterId: "c3",
          rollTotal: 18,
          status: LootPoolRollStatus.ROLLED,
        },
      ],
    });

    expect(result?.winner).toMatchObject({ id: "c3", name: "Sella" });
    expect(result?.rolls.map((entry) => entry.name)).toEqual([
      "Sella",
      "Miri",
      "Toren",
    ]);
    expect(result?.entries).toEqual([
      { id: "r1", status: LootPoolRollStatus.LOST },
      { id: "r2", status: LootPoolRollStatus.LOST },
      { id: "r3", status: LootPoolRollStatus.WON },
    ]);
  });

  it("returns null when no submitted rolled entries are available", () => {
    const result = planLootPoolRollSettlement({
      characters,
      rollEntries: [
        {
          id: "r1",
          characterId: "c1",
          rollTotal: null,
          status: LootPoolRollStatus.ELIGIBLE,
        },
        {
          id: "r2",
          characterId: "c2",
          rollTotal: null,
          status: LootPoolRollStatus.PASSED,
        },
      ],
    });

    expect(result).toBeNull();
  });
});
