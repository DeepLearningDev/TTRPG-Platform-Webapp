"use server";

import { randomInt } from "node:crypto";
import {
  CampaignStatus,
  CraftingJobStatus,
  CraftingRecipeStatus,
  HoldingScope,
  LedgerEntryType,
  LootDistributionMode,
  LootPoolItemStatus,
  LootPoolStatus,
  MailThreadStatus,
  Prisma,
  QuestStatus,
  StorefrontStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateLockoutUntil,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";
import { deriveCraftingHoldings } from "@/lib/crafting-resolution";
import {
  getPlayerMailReplyRecipient,
  isMailThreadVisibleToCharacter,
} from "@/lib/campaign-vault";
import { toggleLootClaimInterest } from "@/lib/loot-progress";
import { planPlayerCraftingRequest } from "@/lib/player-crafting-request";
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
import { decidePlayerQuestAcceptance } from "@/lib/player-quest-acceptance";
import { planPlayerStorefrontSaleRequest } from "@/lib/player-storefront-sale-request";
import { planPlayerStorefrontPurchase } from "@/lib/player-storefront-purchase";
import {
  parseStorefrontSellItemRef,
} from "@/lib/storefront-economy";

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

const storefrontPurchasePlayerMutationSchema = z.object({
  offerId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20),
});

const storefrontSellRequestPlayerMutationSchema = z.object({
  storefrontId: z.string().min(1),
  itemRef: z.string().min(3),
  quantity: z.coerce.number().int().min(1).max(20),
  note: z.string().trim().max(500).optional(),
});

const craftingRequestPlayerMutationSchema = z.object({
  recipeId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

function redirectToPlayerAccountError(code: string): never {
  redirect(`/bank/account?error=${code}`);
}

function redirectToPlayerAccountResult(
  key: "loot" | "quest" | "mail" | "storefront" | "crafting",
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
      bankAccess: {
        isNot: null,
      },
    },
    select: {
      id: true,
      campaignId: true,
      name: true,
      playerName: true,
      bankAccess: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!character?.bankAccess) {
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

async function updateLootClaimInterest(input: {
  lootPoolItemId: string;
  interested: boolean;
}) {
  const character = await requirePlayerMutationContext();

  const result = await prisma.$transaction(async (tx) => {
    const lootPoolItem = await tx.lootPoolItem.findFirst({
      where: {
        id: input.lootPoolItemId,
        status: LootPoolItemStatus.BANKED,
        distributionMode: LootDistributionMode.BANK,
        awardedCharacterId: null,
        lootPool: {
          campaignId: character.campaignId,
          status: {
            in: [LootPoolStatus.OPEN, LootPoolStatus.BANKED],
          },
        },
      },
      select: {
        id: true,
        resolutionMetadata: true,
      },
    });

    if (!lootPoolItem) {
      return {
        ok: false as const,
      };
    }

    await tx.lootPoolItem.update({
      where: {
        id: lootPoolItem.id,
      },
      data: {
        resolutionMetadata: toggleLootClaimInterest({
          metadata: lootPoolItem.resolutionMetadata,
          actorName: character.name,
          interested: input.interested,
        }),
      },
    });

    return {
      ok: true as const,
    };
  });

  if (!result.ok) {
    redirectToPlayerAccountError("invalid-loot-pool-state");
  }

  redirectToPlayerAccountResult(
    "loot",
    input.interested ? "interested" : "withdrawn",
  );
}

export async function markLootClaimInterestAction(formData: FormData) {
  const parsedPayload = lootPoolPlayerMutationSchema.safeParse({
    lootPoolItemId: formData.get("lootPoolItemId"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-loot-pool-state");
  }

  await updateLootClaimInterest({
    lootPoolItemId: payload.lootPoolItemId,
    interested: true,
  });
}

export async function withdrawLootClaimInterestAction(formData: FormData) {
  const parsedPayload = lootPoolPlayerMutationSchema.safeParse({
    lootPoolItemId: formData.get("lootPoolItemId"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-loot-pool-state");
  }

  await updateLootClaimInterest({
    lootPoolItemId: payload.lootPoolItemId,
    interested: false,
  });
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

  const decision = decidePlayerQuestAcceptance({
    character,
    quest,
    acceptedAt: new Date(),
  });

  if (!decision.ok) {
    redirectToPlayerAccountError("invalid-player-quest-state");
  }

  await prisma.quest.update({
    where: {
      id: quest.id,
    },
    data: {
      assigneeCharacterId: decision.assigneeCharacterId,
      status: QuestStatus.ACTIVE,
      notes: decision.notes,
    },
  });

  redirectToPlayerAccountResult("quest", decision.resultCode);
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

  const toName = getPlayerMailReplyRecipient(thread, character);

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

export async function buyStorefrontOfferAction(formData: FormData) {
  const parsedPayload = storefrontPurchasePlayerMutationSchema.safeParse({
    offerId: formData.get("offerId"),
    quantity: formData.get("quantity"),
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-player-storefront-state");
  }

  const character = await requirePlayerMutationContext();
  const result = await prisma.$transaction(async (tx) => {
    const [offer, bankBalance] = await Promise.all([
      tx.storefrontOffer.findFirst({
        where: {
          id: payload.offerId,
          storefront: {
            campaignId: character.campaignId,
            status: StorefrontStatus.ACTIVE,
          },
        },
        include: {
          storefront: true,
        },
      }),
      tx.inventoryLedgerEntry.aggregate({
        where: {
          campaignId: character.campaignId,
          characterId: character.id,
          scope: HoldingScope.BANK,
        },
        _sum: {
          goldDelta: true,
        },
      }),
    ]);

    if (!offer) {
      return {
        ok: false as const,
        reason: "invalid-player-storefront-state" as const,
      };
    }

    const purchasePlan = planPlayerStorefrontPurchase({
      offer,
      requestedQuantity: payload.quantity,
      bankCopperBalance: bankBalance._sum.goldDelta ?? 0,
    });

    if (!purchasePlan.ok) {
      return purchasePlan;
    }

    const stockUpdate = await tx.storefrontOffer.updateMany({
      where: {
        id: offer.id,
        storefrontId: offer.storefrontId,
        quantity: {
          gte: payload.quantity,
        },
      },
      data: {
        quantity: {
          decrement: payload.quantity,
        },
        weeklyPurchasedCount: {
          increment: payload.quantity,
        },
        lifetimePurchasedCount: {
          increment: payload.quantity,
        },
        negotiatedPriceGold: null,
        negotiatedByName: null,
        negotiationNote: null,
      },
    });

    if (stockUpdate.count !== 1) {
      return {
        ok: false as const,
        reason: "invalid-player-storefront-state" as const,
      };
    }

    let lootItemId = purchasePlan.lootItemIntent.existingLootItemId;

    if (!lootItemId && purchasePlan.lootItemIntent.createLootItem) {
      const createLootItem = purchasePlan.lootItemIntent.createLootItem;
      const lootItem = await tx.lootItem.create({
        data: {
          campaignId: character.campaignId,
          name: createLootItem.name,
          rarity: offer.rarity,
          kind: offer.kind,
          description: createLootItem.description,
          sourceTag: createLootItem.sourceTag,
        },
      });

      lootItemId = lootItem.id;
      await tx.storefrontOffer.update({
        where: {
          id: offer.id,
        },
        data: {
          lootItemId,
        },
      });
    }

    await tx.inventoryLedgerEntry.create({
      data: {
        campaignId: character.campaignId,
        characterId: character.id,
        lootItemId,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.PURCHASE,
        quantity: purchasePlan.ledgerIntent.quantity,
        goldDelta: purchasePlan.ledgerIntent.goldDelta,
        note: `Purchased ${payload.quantity}x ${offer.itemName} from ${offer.storefront.name}.`,
      },
    });

    await tx.storefront.update({
      where: {
        id: offer.storefrontId,
      },
      data: {
        cashOnHand: {
          increment: -purchasePlan.ledgerIntent.goldDelta,
        },
      },
    });

    return {
      ok: true as const,
    };
  });

  if (!result.ok) {
    redirectToPlayerAccountError(result.reason);
  }

  redirectToPlayerAccountResult("storefront", "purchased");
}

export async function requestStorefrontSaleAction(formData: FormData) {
  const parsedPayload = storefrontSellRequestPlayerMutationSchema.safeParse({
    storefrontId: formData.get("storefrontId"),
    itemRef: formData.get("itemRef"),
    quantity: formData.get("quantity"),
    note: formData.get("note") ?? undefined,
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-player-storefront-state");
  }

  const character = await requirePlayerMutationContext();
  const itemRef = parseStorefrontSellItemRef(payload.itemRef);

  if (!itemRef) {
    redirectToPlayerAccountError("invalid-player-storefront-state");
  }

  const { scope, lootItemId } = itemRef;

  const result = await prisma.$transaction(async (tx) => {
    const [storefront, lootItem, heldQuantity, existingRequest] = await Promise.all([
      tx.storefront.findFirst({
        where: {
          id: payload.storefrontId,
          campaignId: character.campaignId,
          status: StorefrontStatus.ACTIVE,
        },
      }),
      tx.lootItem.findFirst({
        where: {
          id: lootItemId,
          campaignId: character.campaignId,
        },
      }),
      tx.inventoryLedgerEntry.aggregate({
        where: {
          campaignId: character.campaignId,
          characterId: character.id,
          lootItemId,
          scope,
        },
        _sum: {
          quantity: true,
        },
      }),
      tx.storefrontSellRequest.findFirst({
        where: {
          campaignId: character.campaignId,
          storefrontId: payload.storefrontId,
          characterId: character.id,
          lootItemId,
          sellScope: scope,
          status: "PENDING",
        },
      }),
    ]);

    const saleRequestPlan = planPlayerStorefrontSaleRequest({
      storefront,
      lootItem,
      sellScope: scope,
      requestedQuantity: payload.quantity,
      heldQuantity: heldQuantity._sum.quantity ?? 0,
      hasExistingPendingRequest: Boolean(existingRequest),
      requestedNote: payload.note,
    });

    if (!saleRequestPlan.ok) {
      return saleRequestPlan;
    }

    await tx.storefrontSellRequest.create({
      data: {
        campaignId: character.campaignId,
        storefrontId: saleRequestPlan.requestIntent.storefrontId,
        characterId: character.id,
        lootItemId: saleRequestPlan.requestIntent.lootItemId,
        sellScope: saleRequestPlan.requestIntent.sellScope,
        quantity: saleRequestPlan.requestIntent.quantity,
        suggestedPriceGold: saleRequestPlan.requestIntent.suggestedPriceGold,
        fitScore: saleRequestPlan.requestIntent.fitScore,
        note: saleRequestPlan.requestIntent.note,
      },
    });

    return {
      ok: true as const,
    };
  });

  if (!result.ok) {
    redirectToPlayerAccountError(result.reason);
  }

  redirectToPlayerAccountResult("storefront", "sale-requested");
}

export async function requestCraftingJobAction(formData: FormData) {
  const parsedPayload = craftingRequestPlayerMutationSchema.safeParse({
    recipeId: formData.get("recipeId"),
    notes: formData.get("notes") ?? undefined,
  });
  const payload = parsedPayload.success ? parsedPayload.data : null;

  if (!payload) {
    redirectToPlayerAccountError("invalid-player-crafting-state");
  }

  const character = await requirePlayerMutationContext();
  const [recipe, ledgerEntries, existingJob] = await Promise.all([
    prisma.craftingRecipe.findFirst({
      where: {
        id: payload.recipeId,
        campaignId: character.campaignId,
        status: CraftingRecipeStatus.ACTIVE,
      },
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        campaignId: character.campaignId,
        characterId: character.id,
      },
      include: {
        lootItem: true,
      },
    }),
    prisma.craftingJob.findFirst({
      where: {
        campaignId: character.campaignId,
        characterId: character.id,
        recipeId: payload.recipeId,
        status: CraftingJobStatus.IN_PROGRESS,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (existingJob) {
    redirectToPlayerAccountError("invalid-player-crafting-state");
  }

  const plan = planPlayerCraftingRequest({
    recipe,
    craftingMaterialHoldings: deriveCraftingHoldings(ledgerEntries),
    currentBankCopperBalance: ledgerEntries
      .filter((entry) => entry.scope === HoldingScope.BANK)
      .reduce((sum, entry) => sum + entry.goldDelta, 0),
    requestedNotes: payload.notes,
  });

  if (!plan.ok) {
    redirectToPlayerAccountError(plan.reason);
  }

  await prisma.craftingJob.create({
    data: {
      campaignId: character.campaignId,
      recipeId: plan.jobIntent.recipeId,
      characterId: character.id,
      status: CraftingJobStatus.IN_PROGRESS,
      notes: plan.jobIntent.notes,
    },
  });

  redirectToPlayerAccountResult("crafting", "requested");
}
