"use server";

import { randomInt } from "node:crypto";
import {
  CampaignStatus,
  LootDistributionMode,
  LootPoolItemStatus,
  LootPoolStatus,
  MailThreadStatus,
  Prisma,
  QuestStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateLockoutUntil,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";
import { isMailThreadVisibleToCharacter } from "@/lib/campaign-vault";
import {
  clearPlayerSession,
  getPlayerSession,
  setPlayerSession,
} from "@/lib/player-session";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";
import {
  bankLoginSchema,
  normalizeBankCharacterName,
} from "@/lib/player-bank-login";

export async function loginBankAction(formData: FormData) {
  const parsedPayload = bankLoginSchema.safeParse({
    campaignId: formData.get("campaignId"),
    characterName: formData.get("characterName"),
    pin: formData.get("pin"),
  });

  if (!parsedPayload.success) {
    await clearPlayerSession();
    redirect("/bank?error=invalid");
  }

  const payload = parsedPayload.data;
  const characterName = normalizeBankCharacterName(payload.characterName);
  const characterNameKey = normalizeCharacterNameKey(characterName);

  if (!characterNameKey || !characterName) {
    await clearPlayerSession();
    redirect("/bank?error=invalid");
  }

  const [loginAttempt, characters] = await Promise.all([
    prisma.bankLoginAttempt.findUnique({
      where: {
        campaignId_characterNameKey: {
          campaignId: payload.campaignId,
          characterNameKey,
        },
      },
    }),
    prisma.character.findMany({
      where: {
        campaignId: payload.campaignId,
        bankAccess: {
          isNot: null,
        },
        campaign: {
          status: CampaignStatus.ACTIVE,
        },
      },
      include: {
        bankAccess: true,
        campaign: true,
      },
    }),
  ]);

  if (isLockedOut(loginAttempt?.lockedUntil)) {
    await clearPlayerSession();
    redirect("/bank?error=locked");
  }

  const matchingCharacters = characters.filter(
    (candidate) =>
      normalizeCharacterNameKey(normalizeBankCharacterName(candidate.name)) === characterNameKey,
  );

  const character = matchingCharacters.length === 1 ? matchingCharacters[0] : null;

  if (character?.bankAccess && isLockedOut(character.bankAccess.lockedUntil)) {
    await clearPlayerSession();
    redirect("/bank?error=locked");
  }

  if (!character?.bankAccess || !verifyPin(payload.pin, character.bankAccess.pinHash)) {
    const failedAttemptCount = (loginAttempt?.failedAttemptCount ?? 0) + 1;
    const lockedUntil = calculateLockoutUntil(failedAttemptCount);

    await prisma.$transaction(async (tx) => {
      await tx.bankLoginAttempt.upsert({
        where: {
          campaignId_characterNameKey: {
            campaignId: payload.campaignId,
            characterNameKey,
          },
        },
        create: {
          campaignId: payload.campaignId,
          characterNameKey,
          failedAttemptCount,
          lockedUntil,
          lastAttemptAt: new Date(),
        },
        update: {
          failedAttemptCount,
          lockedUntil,
          lastAttemptAt: new Date(),
        },
      });

      if (character?.bankAccess) {
        const failedLoginCount = character.bankAccess.failedLoginCount + 1;

        await tx.bankAccess.update({
          where: {
            id: character.bankAccess.id,
          },
          data: {
            failedLoginCount,
            lockedUntil: calculateLockoutUntil(failedLoginCount),
          },
        });
      }
    });

    await clearPlayerSession();
    redirect("/bank?error=invalid");
  }

  await prisma.$transaction([
    prisma.bankAccess.update({
      where: {
        id: character.bankAccess.id,
      },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.bankLoginAttempt.deleteMany({
      where: {
        campaignId: payload.campaignId,
        characterNameKey,
      },
    }),
  ]);

  await setPlayerSession({
    campaignId: character.campaignId,
    characterId: character.id,
  });

  redirect("/bank/account");
}

export async function logoutBankAction() {
  await clearPlayerSession();
  redirect("/bank");
}

const lootPoolPlayerMutationSchema = z.object({
  lootPoolItemId: z.string().min(1),
});

const questPlayerMutationSchema = z.object({
  questId: z.string().min(1),
});

const mailReplyPlayerMutationSchema = z.object({
  threadId: z.string().min(1),
  body: z.string().trim().min(4).max(800),
});

function redirectToPlayerAccountError(code: string): never {
  redirect(`/bank/account?error=${code}`);
}

function redirectToPlayerAccountResult(
  key: "loot" | "quest" | "mail",
  code: string,
): never {
  redirect(`/bank/account?${key}=${code}`);
}

async function requirePlayerMutationContext() {
  const session = await getPlayerSession();

  if (!session) {
    redirect("/bank");
  }

  const character = await prisma.character.findFirst({
    where: {
      id: session.characterId,
      campaignId: session.campaignId,
      campaign: {
        status: CampaignStatus.ACTIVE,
      },
    },
    select: {
      id: true,
      campaignId: true,
      name: true,
      playerName: true,
    },
  });

  if (!character) {
    await clearPlayerSession();
    redirect("/bank");
  }

  return character;
}

async function createPlayerLootPoolResponse(input: {
  lootPoolItemId: string;
  response: "ROLLED" | "PASSED";
}) {
  const character = await requirePlayerMutationContext();
  const rollTotal = input.response === "ROLLED" ? randomInt(1, 21) : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lootPoolItem = await tx.lootPoolItem.findFirst({
        where: {
          id: input.lootPoolItemId,
          status: LootPoolItemStatus.UNRESOLVED,
          distributionMode: LootDistributionMode.ROLL,
          awardedCharacterId: null,
          lootPool: {
            campaignId: character.campaignId,
            status: LootPoolStatus.OPEN,
          },
        },
        select: {
          id: true,
        },
      });

      if (!lootPoolItem) {
        return {
          ok: false as const,
          reason: "invalid-loot-pool-state",
        };
      }

      await tx.lootPoolRollEntry.create({
        data: {
          lootPoolItemId: lootPoolItem.id,
          characterId: character.id,
          rollTotal,
          status: input.response,
        },
      });

      return {
        ok: true as const,
      };
    });

    if (!result.ok) {
      redirectToPlayerAccountError(result.reason);
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirectToPlayerAccountError("duplicate-loot-response");
    }

    throw error;
  }

  redirectToPlayerAccountResult(
    "loot",
    input.response === "ROLLED" ? "rolled" : "passed",
  );
}

export async function rollOnLootPoolItemAction(formData: FormData) {
  const parsedPayload = lootPoolPlayerMutationSchema.safeParse({
    lootPoolItemId: formData.get("lootPoolItemId"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-loot-pool-state");
  }

  await createPlayerLootPoolResponse({
    lootPoolItemId: payload.lootPoolItemId,
    response: "ROLLED",
  });
}

export async function passOnLootPoolItemAction(formData: FormData) {
  const parsedPayload = lootPoolPlayerMutationSchema.safeParse({
    lootPoolItemId: formData.get("lootPoolItemId"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-loot-pool-state");
  }

  await createPlayerLootPoolResponse({
    lootPoolItemId: payload.lootPoolItemId,
    response: "PASSED",
  });
}

function appendPlayerQuestNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note;
}

export async function acceptQuestAction(formData: FormData) {
  const parsedPayload = questPlayerMutationSchema.safeParse({
    questId: formData.get("questId"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-player-quest-state");
  }

  const character = await requirePlayerMutationContext();
  const quest = await prisma.quest.findFirst({
    where: {
      id: payload.questId,
      campaignId: character.campaignId,
      status: QuestStatus.OPEN,
    },
    select: {
      id: true,
      title: true,
      notes: true,
      assigneeCharacterId: true,
    },
  });

  if (!quest) {
    redirectToPlayerAccountError("invalid-player-quest-state");
  }

  const isOpenToParty = !quest.assigneeCharacterId;
  const isAssignedToPlayer = quest.assigneeCharacterId === character.id;

  if (!isOpenToParty && !isAssignedToPlayer) {
    redirectToPlayerAccountError("invalid-player-quest-state");
  }

  const dateLabel = new Date().toISOString().slice(0, 10);
  const isAcknowledgement = isAssignedToPlayer;
  const playerNote = isAcknowledgement
    ? `${dateLabel}: ${character.name} acknowledged this quest from the player hub.`
    : `${dateLabel}: ${character.name} accepted this quest from the player hub.`;

  await prisma.quest.update({
    where: {
      id: quest.id,
    },
    data: {
      assigneeCharacterId: isOpenToParty ? character.id : quest.assigneeCharacterId,
      status: QuestStatus.ACTIVE,
      notes: appendPlayerQuestNote(quest.notes, playerNote),
    },
  });

  redirectToPlayerAccountResult(
    "quest",
    isAcknowledgement ? "acknowledged" : "accepted",
  );
}

export async function replyToMailThreadAction(formData: FormData) {
  const parsedPayload = mailReplyPlayerMutationSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-player-mail-state");
  }

  const character = await requirePlayerMutationContext();
  const thread = await prisma.mailThread.findFirst({
    where: {
      id: payload.threadId,
      campaignId: character.campaignId,
      status: MailThreadStatus.ACTIVE,
    },
    select: {
      id: true,
      senderName: true,
      recipientName: true,
    },
  });

  if (!thread || !isMailThreadVisibleToCharacter(thread, character)) {
    redirectToPlayerAccountError("invalid-player-mail-state");
  }

  const toName =
    thread.senderName.toLowerCase() === character.name.toLowerCase()
      ? thread.recipientName
      : thread.senderName;

  await prisma.mailThread.update({
    where: {
      id: thread.id,
    },
    data: {
      updatedAt: new Date(),
      messages: {
        create: {
          fromName: character.name,
          toName,
          body: payload.body,
          isFromDm: false,
        },
      },
    },
  });

  redirectToPlayerAccountResult("mail", "sent");
}
