import { describe, expect, it } from "vitest";
import { HoldingScope } from "@prisma/client";
import {
  deriveHoldings,
  getMailThreadReplySummary,
  getPlayerMailReplyRecipient,
  isMailThreadVisibleToCharacter,
  orderMailThreadsByFocus,
} from "@/lib/campaign-vault";

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
  it("shows direct-character recipient threads to the logged-in player", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "  miri   vale  ",
          senderName: "Captain Ori Pell",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(true);
  });

  it("shows sender-is-player threads to the logged-in player", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "Captain Ori Pell",
          senderName: "  miri   vale  ",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(true);
  });

  it("shows player-name recipient threads to the logged-in player", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "  kaLEB  ",
          senderName: "Captain Ori Pell",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(true);
  });

  it("shows party threads to the logged-in player", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: " Party ",
          senderName: "Quartermaster",
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

  it("does not expose unrelated threads through substring name matches", () => {
    expect(
      isMailThreadVisibleToCharacter(
        {
          recipientName: "Miri",
          senderName: "Quartermaster",
        },
        {
          name: "Miri Vale",
          playerName: "Kaleb",
        },
      ),
    ).toBe(false);
  });
});

describe("getPlayerMailReplyRecipient", () => {
  it("replies to the sender when the player is the recipient", () => {
    expect(
      getPlayerMailReplyRecipient(
        {
          recipientName: "Miri Vale",
          senderName: "Captain Ori Pell",
        },
        {
          name: "Miri Vale",
        },
      ),
    ).toBe("Captain Ori Pell");
  });

  it("replies to the recipient when the player is the sender", () => {
    expect(
      getPlayerMailReplyRecipient(
        {
          recipientName: "Captain Ori Pell",
          senderName: "  miri   vale  ",
        },
        {
          name: "Miri Vale",
        },
      ),
    ).toBe("Captain Ori Pell");
  });
});

describe("orderMailThreadsByFocus", () => {
  const threads = [
    { id: "first", subject: "First thread" },
    { id: "second", subject: "Second thread" },
    { id: "third", subject: "Third thread" },
  ];

  it("moves an existing requested thread to the front and reports it as focused", () => {
    const result = orderMailThreadsByFocus(threads, "second");

    expect(result.focusedMailThread).toBe(threads[1]);
    expect(result.orderedMailThreads).toEqual([threads[1], threads[0], threads[2]]);
  });

  it("preserves original order and reports no focus when the requested thread is missing", () => {
    const result = orderMailThreadsByFocus(threads, "missing");

    expect(result.focusedMailThread).toBeUndefined();
    expect(result.orderedMailThreads).toBe(threads);
  });

  it("preserves original order and reports no focus when no thread is requested", () => {
    const result = orderMailThreadsByFocus(threads);

    expect(result.focusedMailThread).toBeUndefined();
    expect(result.orderedMailThreads).toBe(threads);
  });
});

describe("getMailThreadReplySummary", () => {
  it("reports an empty thread without a last message or player reply", () => {
    expect(getMailThreadReplySummary({ messages: [] })).toEqual({
      messageCount: 0,
      hasPlayerReplies: false,
      lastMessageSender: undefined,
      lastMessageBody: undefined,
    });
  });

  it("reports DM-only threads with the final DM message", () => {
    expect(
      getMailThreadReplySummary({
        messages: [
          {
            fromName: "DM",
            body: "A courier delivers a sealed note.",
            isFromDm: true,
          },
          {
            fromName: "Captain Ori Pell",
            body: "Meet me at the low-tide gate.",
            isFromDm: true,
          },
        ],
      }),
    ).toEqual({
      messageCount: 2,
      hasPlayerReplies: false,
      lastMessageSender: "Captain Ori Pell",
      lastMessageBody: "Meet me at the low-tide gate.",
    });
  });

  it("flags player replies and reports the final player message", () => {
    expect(
      getMailThreadReplySummary({
        messages: [
          {
            fromName: "Captain Ori Pell",
            body: "Can you take the old road?",
            isFromDm: true,
          },
          {
            fromName: "Miri Vale",
            body: "I will leave before dawn.",
            isFromDm: false,
          },
        ],
      }),
    ).toEqual({
      messageCount: 2,
      hasPlayerReplies: true,
      lastMessageSender: "Miri Vale",
      lastMessageBody: "I will leave before dawn.",
    });
  });
});
