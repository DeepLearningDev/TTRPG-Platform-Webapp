import { describe, expect, it } from "vitest";
import { bankLoginSchema, normalizeBankCharacterName } from "@/lib/player-bank-login";

describe("player-bank-login", () => {
  it("trims and accepts a standard bank login payload", () => {
    const parsed = bankLoginSchema.safeParse({
      campaignId: "  campaign-1  ",
      characterName: "  Miri   Vale  ",
      pin: " 2413 ",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data).toEqual({
      campaignId: "campaign-1",
      characterName: "Miri   Vale",
      pin: "2413",
    });
    expect(normalizeBankCharacterName(parsed.data.characterName)).toBe("Miri Vale");
  });

  it("rejects malformed pins", () => {
    expect(
      bankLoginSchema.safeParse({
        campaignId: "campaign-1",
        characterName: "Miri Vale",
        pin: "24a3",
      }).success,
    ).toBe(false);

    expect(
      bankLoginSchema.safeParse({
        campaignId: "campaign-1",
        characterName: "Miri Vale",
        pin: "123",
      }).success,
    ).toBe(false);
  });

  it("rejects blank values after trimming", () => {
    expect(
      bankLoginSchema.safeParse({
        campaignId: "   ",
        characterName: "Miri Vale",
        pin: "2413",
      }).success,
    ).toBe(false);
  });
});
