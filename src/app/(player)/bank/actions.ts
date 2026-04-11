"use server";

import { randomInt } from "node:crypto";
import {
  CampaignStatus,
  LootDistributionMode,
  LootPoolItemStatus,
  LootPoolStatus,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateLockoutUntil,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";
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

function redirectToPlayerAccountError(code: string): never {
  redirect(`/bank/account?error=${code}`);
}

function redirectToPlayerAccountResult(code: string): never {
  redirect(`/bank/account?loot=${code}`);
}

async function requirePlayerLootContext() {
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
  const character = await requirePlayerLootContext();
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
