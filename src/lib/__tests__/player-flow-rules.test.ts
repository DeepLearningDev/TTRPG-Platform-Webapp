import { describe, expect, it } from "vitest";
import {
  canPlayerMarkLootClaimInterest,
  canPlayerRespondToLootPoolItem,
} from "@/lib/player-flow-rules";
import type { PlayerLootItemProgress } from "@/lib/loot-progress";

function buildProgress(
  override: Partial<PlayerLootItemProgress> = {},
): PlayerLootItemProgress {
  return {
    key: "banked",
    headline: "Banked for later",
    detail: "No party member has marked interest yet.",
    myRoll: null,
    claimInterestNames: [],
    reservedForName: null,
    hasClaimInterest: false,
    ...override,
  };
}

describe("canPlayerRespondToLootPoolItem", () => {
  it("allows unresolved roll items with no player response and no award", () => {
    expect(
      canPlayerRespondToLootPoolItem({
        accountId: "char-1",
        item: {
          status: "UNRESOLVED",
          distributionMode: "ROLL",
          awardedCharacter: null,
          rollEntries: [],
        },
      }),
    ).toBe(true);
  });

  it("blocks items the player already rolled or passed on", () => {
    expect(
      canPlayerRespondToLootPoolItem({
        accountId: "char-1",
        item: {
          status: "UNRESOLVED",
          distributionMode: "ROLL",
          awardedCharacter: null,
          rollEntries: [
            {
              characterId: "char-1",
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("blocks assigned or banked items", () => {
    expect(
      canPlayerRespondToLootPoolItem({
        accountId: "char-1",
        item: {
          status: "ASSIGNED",
          distributionMode: "ROLL",
          awardedCharacter: {
            id: "char-2",
          },
          rollEntries: [],
        },
      }),
    ).toBe(false);

    expect(
      canPlayerRespondToLootPoolItem({
        accountId: "char-1",
        item: {
          status: "BANKED",
          distributionMode: "BANK",
          awardedCharacter: null,
          rollEntries: [],
        },
      }),
    ).toBe(false);
  });
});

describe("canPlayerMarkLootClaimInterest", () => {
  it("allows banked unreserved item progress", () => {
    expect(
      canPlayerMarkLootClaimInterest({
        progress: buildProgress(),
      }),
    ).toBe(true);
  });

  it("blocks reserved banked item progress", () => {
    expect(
      canPlayerMarkLootClaimInterest({
        progress: buildProgress({
          reservedForName: "Miri Vale",
        }),
      }),
    ).toBe(false);
  });
});
