"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateLockoutUntil,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";
import { authenticateBankAccess } from "@/lib/campaign-vault";
import { clearPlayerSession, setPlayerSession } from "@/lib/player-session";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

const loginSchema = z.object({
  campaignId: z.string().min(1),
  characterName: z.string().min(2),
  pin: z.string().min(4).max(12),
});

export async function loginBankAction(formData: FormData) {
  const parsedPayload = loginSchema.safeParse({
    campaignId: formData.get("campaignId"),
    characterName: formData.get("characterName"),
    pin: formData.get("pin"),
  });

  if (!parsedPayload.success) {
    await clearPlayerSession();
    redirect("/bank?error=invalid");
  }

  const payload = parsedPayload.data;
  const characterNameKey = normalizeCharacterNameKey(payload.characterName);

  if (!characterNameKey) {
    await clearPlayerSession();
    redirect("/bank?error=invalid");
  }

  const loginAttempt = await prisma.bankLoginAttempt.findUnique({
    where: {
      campaignId_characterNameKey: {
        campaignId: payload.campaignId,
        characterNameKey,
      },
    },
  });

  if (isLockedOut(loginAttempt?.lockedUntil)) {
    await clearPlayerSession();
    redirect("/bank?error=locked");
  }

  const character = await authenticateBankAccess({
    campaignId: payload.campaignId,
    characterName: payload.characterName,
  });

  if (character?.bankAccess && isLockedOut(character.bankAccess.lockedUntil)) {
    await clearPlayerSession();
    redirect("/bank?error=locked");
  }

  if (!character?.bankAccess || !verifyPin(payload.pin, character.bankAccess.pinHash)) {
    const failedAttemptCount = (loginAttempt?.failedAttemptCount ?? 0) + 1;
    const lockedUntil = calculateLockoutUntil(failedAttemptCount);

    await prisma.bankLoginAttempt.upsert({
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

      await prisma.bankAccess.update({
        where: {
          id: character.bankAccess.id,
        },
        data: {
          failedLoginCount,
          lockedUntil: calculateLockoutUntil(failedLoginCount),
        },
      });
    }

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
