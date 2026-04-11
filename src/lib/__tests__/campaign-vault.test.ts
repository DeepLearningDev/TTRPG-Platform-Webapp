import { describe, expect, it } from "vitest";
import { HoldingScope } from "@prisma/client";
import { deriveHoldings, isMailThreadVisibleToCharacter } from "@/lib/campaign-vault";

describe("deriveHoldings", () => {
  it("totals gold and keeps only positive item balances for a scope", () => {
    const snapshot = deriveHoldings(
      [
        {
          scope: HoldingScope.BANK,
          goldDelta: 820,
          quantity: 1,
          lootItem: {
            id: "ward-key",
            name: "Ward-Key Ring",
            rarity: "UNCOMMON",
            kind: "WONDROUS",
          },
        },
        {
          scope: HoldingScope.BANK,
          goldDelta: 0,
          quantity: -1,
          lootItem: {
            id: "ward-key",
            name: "Ward-Key Ring",
            rarity: "UNCOMMON",
            kind: "WONDROUS",
          },
        },
        {
          scope: HoldingScope.BANK,
          goldDelta: 140,
          quantity: 2,
          lootItem: {
            id: "ember-band",
            name: "Ashen Ember Band",
            rarity: "RARE",
            kind: "WONDROUS",
          },
        },
        {
          scope: HoldingScope.INVENTORY,
          goldDelta: 999,
          quantity: 10,
          lootItem: {
            id: "ignored",
            name: "Ignored",
            rarity: "COMMON",
            kind: "TOOL",
          },
        },
      ],
      HoldingScope.BANK,
    );

    expect(snapshot.gold).toBe(960);
    expect(snapshot.items).toEqual([
      {
        id: "ember-band",
        name: "Ashen Ember Band",
        rarity: "RARE",
        kind: "WONDROUS",
        quantity: 2,
      },
    ]);
  });
});

describe("isMailThreadVisibleToCharacter", () => {
  it("shows party and direct-character threads to the logged-in player", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "Party",
          senderName: "Quartermaster",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(true);

    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "Miri Vale",
          senderName: "Captain Ori Pell",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(true);
  });

  it("hides unrelated threads", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "Toren Ash",
          senderName: "Guild Clerk",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(false);
  });
});
