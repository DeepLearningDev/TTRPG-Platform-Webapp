import { describe, expect, it } from "vitest";
import {
  formatLootClaimInterestMetadata,
  getPlayerLootItemProgress,
  parseLootClaimInterestNames,
  summarizePlayerLootPool,
  toggleLootClaimInterest,
} from "@/lib/loot-progress";

describe("getPlayerLootItemProgress", () => {
  it("marks unresolved roll items without a response as actionable", () => {
    const progress = getPlayerLootItemProgress({
      accountId: "char-1",
      item: {
        status: "UNRESOLVED",
        distributionMode: "ROLL",
        awardedCharacter: null,
        resolutionMetadata: null,
        rollEntries: [],
      },
    });

    expect(progress.key).toBe("action-needed");
    expect(progress.headline).toBe("Action needed");
  });

  it("marks responded roll items as awaiting resolution", () => {
    const progress = getPlayerLootItemProgress({
      accountId: "char-1",
      item: {
        status: "UNRESOLVED",
        distributionMode: "ROLL",
        awardedCharacter: null,
        resolutionMetadata: null,
        rollEntries: [
          {
            characterId: "char-1",
            rollTotal: 17,
            status: "ROLLED",
          },
        ],
      },
    });

    expect(progress.key).toBe("awaiting-resolution");
    expect(progress.myRoll?.rollTotal).toBe(17);
  });

  it("marks awarded items for the logged-in player as assigned to you", () => {
    const progress = getPlayerLootItemProgress({
      accountId: "char-1",
      item: {
        status: "ROLLED",
        distributionMode: "ROLL",
        awardedCharacter: {
          id: "char-1",
          name: "Miri Vale",
        },
        resolutionMetadata: "Winner: Miri Vale.",
        rollEntries: [],
      },
    });

    expect(progress.key).toBe("assigned-to-you");
  });

  it("shows claim interest on banked items", () => {
    const progress = getPlayerLootItemProgress({
      accountId: "char-1",
      actorName: "Miri Vale",
      item: {
        status: "BANKED",
        distributionMode: "BANK",
        awardedCharacter: null,
        resolutionMetadata: "Claim interest: Miri Vale, Toren Ash.",
        rollEntries: [],
      },
    });

    expect(progress.key).toBe("banked");
    expect(progress.hasClaimInterest).toBe(true);
    expect(progress.claimInterestNames).toEqual(["Miri Vale", "Toren Ash"]);
  });
});

describe("summarizePlayerLootPool", () => {
  it("counts actionable, waiting, assigned, and banked item states", () => {
    const summary = summarizePlayerLootPool({
      accountId: "char-1",
      actorName: "Miri Vale",
      items: [
        {
          status: "UNRESOLVED",
          distributionMode: "ROLL",
          awardedCharacter: null,
          resolutionMetadata: null,
          rollEntries: [],
        },
        {
          status: "UNRESOLVED",
          distributionMode: "ROLL",
          awardedCharacter: null,
          resolutionMetadata: null,
          rollEntries: [
            {
              characterId: "char-1",
              rollTotal: 14,
              status: "ROLLED",
            },
          ],
        },
        {
          status: "ASSIGNED",
          distributionMode: "ASSIGN",
          awardedCharacter: {
            id: "char-1",
            name: "Miri Vale",
          },
          resolutionMetadata: null,
          rollEntries: [],
        },
        {
          status: "BANKED",
          distributionMode: "BANK",
          awardedCharacter: null,
          resolutionMetadata: "Claim interest: Miri Vale.",
          rollEntries: [],
        },
      ],
    });

    expect(summary).toEqual({
      actionNeeded: 1,
      awaitingResolution: 1,
      assignedToYou: 1,
      banked: 1,
      claimInterest: 1,
    });
  });
});

describe("claim interest metadata helpers", () => {
  it("parses and formats readable claim interest text", () => {
    expect(
      parseLootClaimInterestNames("Claim interest: Miri Vale, Toren Ash."),
    ).toEqual(["Miri Vale", "Toren Ash"]);
    expect(formatLootClaimInterestMetadata(["Miri Vale", "Toren Ash"])).toBe(
      "Claim interest: Miri Vale, Toren Ash.",
    );
  });

  it("adds and removes claim interest without duplicating names", () => {
    expect(
      toggleLootClaimInterest({
        metadata: "Claim interest: Toren Ash.",
        actorName: "Miri Vale",
        interested: true,
      }),
    ).toBe("Claim interest: Toren Ash, Miri Vale.");

    expect(
      toggleLootClaimInterest({
        metadata: "Claim interest: Toren Ash, Miri Vale.",
        actorName: "Miri Vale",
        interested: false,
      }),
    ).toBe("Claim interest: Toren Ash.");
  });
});
