"use server";

import { CampaignStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  calculateLockoutUntil,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";
import { clearPlayerSession, setPlayerSession } from "@/lib/player-session";
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
