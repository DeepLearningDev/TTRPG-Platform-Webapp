import { describe, expect, it } from "vitest";
import { decidePlayerQuestAcceptance } from "@/lib/player-quest-acceptance";

const acceptedAt = new Date("2026-05-11T14:35:00.000Z");
const character = {
  id: "char-1",
  name: "Miri Vale",
};

describe("decidePlayerQuestAcceptance", () => {
  it("accepts open unassigned quests and assigns them to the player", () => {
    const decision = decidePlayerQuestAcceptance({
      acceptedAt,
      character,
      quest: {
        assigneeCharacterId: null,
        notes: null,
      },
    });

    expect(decision).toEqual({
      ok: true,
      assigneeCharacterId: "char-1",
      notes: "2026-05-11: Miri Vale accepted this quest from the player hub.",
      resultCode: "accepted",
    });
  });

  it("acknowledges open quests already assigned to the player without changing assignee", () => {
    const decision = decidePlayerQuestAcceptance({
      acceptedAt,
      character,
      quest: {
        assigneeCharacterId: "char-1",
        notes: "DM note.",
      },
    });

    expect(decision).toEqual({
      ok: true,
      assigneeCharacterId: "char-1",
      notes:
        "DM note.\n2026-05-11: Miri Vale acknowledged this quest from the player hub.",
      resultCode: "acknowledged",
    });
  });

  it("rejects quests assigned to someone else", () => {
    const decision = decidePlayerQuestAcceptance({
      acceptedAt,
      character,
      quest: {
        assigneeCharacterId: "char-2",
        notes: "Existing note.",
      },
    });

    expect(decision).toEqual({
      ok: false,
      reason: "assigned-to-someone-else",
    });
  });
});
