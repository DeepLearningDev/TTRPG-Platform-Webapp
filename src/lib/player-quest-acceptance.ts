export type PlayerQuestAcceptanceQuest = {
  assigneeCharacterId: string | null;
  notes: string | null;
};

export type PlayerQuestAcceptanceCharacter = {
  id: string;
  name: string;
};

export type PlayerQuestAcceptanceDecision =
  | {
      ok: true;
      assigneeCharacterId: string;
      notes: string;
      resultCode: "accepted" | "acknowledged";
    }
  | {
      ok: false;
      reason: "assigned-to-someone-else";
    };

function appendPlayerQuestNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note;
}

export function decidePlayerQuestAcceptance(input: {
  character: PlayerQuestAcceptanceCharacter;
  quest: PlayerQuestAcceptanceQuest;
  acceptedAt: Date;
}): PlayerQuestAcceptanceDecision {
  const isOpenToParty = !input.quest.assigneeCharacterId;
  const isAssignedToPlayer =
    input.quest.assigneeCharacterId === input.character.id;

  if (!isOpenToParty && !isAssignedToPlayer) {
    return {
      ok: false,
      reason: "assigned-to-someone-else",
    };
  }

  const dateLabel = input.acceptedAt.toISOString().slice(0, 10);
  const isAcknowledgement = isAssignedToPlayer;
  const playerNote = isAcknowledgement
    ? `${dateLabel}: ${input.character.name} acknowledged this quest from the player hub.`
    : `${dateLabel}: ${input.character.name} accepted this quest from the player hub.`;

  return {
    ok: true,
    assigneeCharacterId: input.quest.assigneeCharacterId ?? input.character.id,
    notes: appendPlayerQuestNote(input.quest.notes, playerNote),
    resultCode: isAcknowledgement ? "acknowledged" : "accepted",
  };
}
