"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateBankAccess } from "@/lib/campaign-vault";
import { clearPlayerSession, setPlayerSession } from "@/lib/player-session";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/pin";

export async function loginBankAction(formData: FormData) {
  const payload = z
    .object({
      campaignId: z.string().min(1),
      characterName: z.string().min(2),
      pin: z.string().min(4).max(12),
    })
    .parse({
      campaignId: formData.get("campaignId"),
      characterName: formData.get("characterName"),
      pin: formData.get("pin"),
    });

  const character = await authenticateBankAccess({
    campaignId: payload.campaignId,
    characterName: payload.characterName,
  });

  if (!character?.bankAccess || !verifyPin(payload.pin, character.bankAccess.pinHash)) {
    redirect("/bank?error=invalid");
  }

  await prisma.bankAccess.update({
    where: {
      id: character.bankAccess.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

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
