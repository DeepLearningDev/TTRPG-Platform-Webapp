"use server";

import {
  CampaignStatus,
  EncounterDifficulty,
  HoldingScope,
  LedgerEntryType,
  CraftingJobStatus,
  LootKind,
  LootRarity,
  NpcType,
  QuestStatus,
  StorefrontStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { importCompendiumBatch, clampImportBudget } from "@/lib/compendium-source";
import { parseTagInput } from "@/lib/campaign-vault";
import {
  readBooleanField,
  readOptionalNumberField,
  readOptionalTextField,
  readTextField,
} from "@/lib/form-fields";
import {
  clearDmSession,
  isValidDmCredential,
  requireDmSession,
  setDmSession,
} from "@/lib/dm-session";
import { hashPin } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

const npcSchema = z.object({
  campaignId: z.string().min(1),
  campaignSlug: z.string().min(1),
  name: z.string().min(2),
  title: z.string().optional(),
  type: z.nativeEnum(NpcType),
  surfaceBlurb: z.string().min(12),
  tableHooks: z.string().min(6),
  persistentNotes: z.string().min(12),
  faction: z.string().optional(),
  relationshipNotes: z.string().optional(),
});

function redirectToCampaign(slug: string): never {
  revalidatePath("/dm");
  redirect(`/dm?campaign=${slug}`);
}

function slugifyCampaignName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function loginDmAction(formData: FormData) {
  const payload = z
    .object({
      username: z.string().min(1),
      accessCode: z.string().min(1),
    })
    .parse({
      username: formData.get("username"),
      accessCode: formData.get("accessCode"),
    });

  if (!isValidDmCredential(payload)) {
    redirect("/dm/login?error=invalid");
  }

  await setDmSession({
    role: "dm",
    username: payload.username.trim(),
  });

  redirect("/dm");
}

export async function logoutDmAction() {
  await clearDmSession();
  redirect("/dm/login");
}

export async function createCampaignAction(formData: FormData) {
  await requireDmSession();

  const payload = z.object({
    name: z.string().min(3),
    setting: z.string().min(6),
    summary: z.string().min(12),
    sessionNight: z.string().optional(),
  }).parse({
    name: formData.get("name"),
    setting: formData.get("setting"),
    summary: formData.get("summary"),
    sessionNight: formData.get("sessionNight") || undefined,
  });

  const baseSlug = slugifyCampaignName(payload.name);
  const existingCount = await prisma.campaign.count({
    where: {
      slug: {
        startsWith: baseSlug,
      },
    },
  });
  const slug = existingCount > 0 ? `${baseSlug}-${existingCount + 1}` : baseSlug;

  await prisma.campaign.create({
    data: {
      slug,
      name: payload.name.trim(),
      setting: payload.setting.trim(),
      summary: payload.summary.trim(),
      sessionNight: payload.sessionNight?.trim() || null,
      status: CampaignStatus.ACTIVE,
    },
  });

  redirectToCampaign(slug);
}

export async function archiveCampaignAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));

  await prisma.campaign.update({
    where: {
      id,
    },
    data: {
      status: CampaignStatus.ARCHIVED,
    },
  });

  revalidatePath("/dm");
  redirect("/dm");
}

const pinSchema = z.string().regex(/^\d{4,8}$/);

export async function createCharacterAction(formData: FormData) {
  await requireDmSession();

  const payload = z.object({
    campaignId: z.string().min(1),
    campaignSlug: z.string().min(1),
    name: z.string().min(2),
    classRole: z.string().min(2),
    level: z.coerce.number().int().min(1).max(20),
    playerName: z.string().min(2),
    notes: z.string().optional(),
    pin: pinSchema,
  }).parse({
    campaignId: formData.get("campaignId"),
    campaignSlug: formData.get("campaignSlug"),
    name: formData.get("name"),
    classRole: formData.get("classRole"),
    level: formData.get("level"),
    playerName: formData.get("playerName"),
    notes: formData.get("notes") || undefined,
    pin: formData.get("pin"),
  });

  await prisma.character.create({
    data: {
      campaignId: payload.campaignId,
      name: payload.name.trim(),
      classRole: payload.classRole.trim(),
      level: payload.level,
      playerName: payload.playerName.trim(),
      notes: payload.notes?.trim() || null,
      bankAccess: {
        create: {
          pinHash: hashPin(payload.pin),
        },
      },
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function updateCharacterAction(formData: FormData) {
  await requireDmSession();

  const payload = z.object({
    id: z.string().min(1),
    campaignSlug: z.string().min(1),
    name: z.string().min(2),
    classRole: z.string().min(2),
    level: z.coerce.number().int().min(1).max(20),
    playerName: z.string().min(2),
    notes: z.string().optional(),
    pin: z.string().optional(),
  }).parse({
    id: formData.get("id"),
    campaignSlug: formData.get("campaignSlug"),
    name: formData.get("name"),
    classRole: formData.get("classRole"),
    level: formData.get("level"),
    playerName: formData.get("playerName"),
    notes: formData.get("notes") || undefined,
    pin: formData.get("pin") || undefined,
  });

  await prisma.character.update({
    where: {
      id: payload.id,
    },
    data: {
      name: payload.name.trim(),
      classRole: payload.classRole.trim(),
      level: payload.level,
      playerName: payload.playerName.trim(),
      notes: payload.notes?.trim() || null,
    },
  });

  const nextPin = payload.pin?.trim();

  if (nextPin) {
    pinSchema.parse(nextPin);

    await prisma.bankAccess.upsert({
      where: {
        characterId: payload.id,
      },
      create: {
        characterId: payload.id,
        pinHash: hashPin(nextPin),
      },
      update: {
        pinHash: hashPin(nextPin),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  redirectToCampaign(payload.campaignSlug);
}

export async function createNpcAction(formData: FormData) {
  await requireDmSession();

  const payload = npcSchema.parse({
    campaignId: formData.get("campaignId"),
    campaignSlug: formData.get("campaignSlug"),
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    type: formData.get("type"),
    surfaceBlurb: formData.get("surfaceBlurb"),
    tableHooks: formData.get("tableHooks"),
    persistentNotes: formData.get("persistentNotes"),
    faction: formData.get("faction") || undefined,
    relationshipNotes: formData.get("relationshipNotes") || undefined,
  });

  await prisma.npc.create({
    data: {
      campaignId: payload.campaignId,
      name: payload.name.trim(),
      title: payload.title?.trim() || null,
      type: payload.type,
      tags: parseTagInput(formData.get("tags")),
      surfaceBlurb: payload.surfaceBlurb.trim(),
      tableHooks: payload.tableHooks.trim(),
      persistentNotes: payload.persistentNotes.trim(),
      faction: payload.faction?.trim() || null,
      relationshipNotes: payload.relationshipNotes?.trim() || null,
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function updateNpcAction(formData: FormData) {
  await requireDmSession();

  const payload = npcSchema.extend({ id: z.string().min(1) }).parse({
    id: formData.get("id"),
    campaignId: formData.get("campaignId"),
    campaignSlug: formData.get("campaignSlug"),
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    type: formData.get("type"),
    surfaceBlurb: formData.get("surfaceBlurb"),
    tableHooks: formData.get("tableHooks"),
    persistentNotes: formData.get("persistentNotes"),
    faction: formData.get("faction") || undefined,
    relationshipNotes: formData.get("relationshipNotes") || undefined,
  });

  await prisma.npc.update({
    where: {
      id: payload.id,
    },
    data: {
      name: payload.name.trim(),
      title: payload.title?.trim() || null,
      type: payload.type,
      tags: parseTagInput(formData.get("tags")),
      surfaceBlurb: payload.surfaceBlurb.trim(),
      tableHooks: payload.tableHooks.trim(),
      persistentNotes: payload.persistentNotes.trim(),
      faction: payload.faction?.trim() || null,
      relationshipNotes: payload.relationshipNotes?.trim() || null,
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function archiveNpcAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));

  await prisma.npc.update({
    where: {
      id,
    },
    data: {
      isArchived: true,
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function createEncounterAction(formData: FormData) {
  await requireDmSession();

  const payload = z
    .object({
      campaignId: z.string().min(1),
      campaignSlug: z.string().min(1),
      title: z.string().min(3),
      difficulty: z.nativeEnum(EncounterDifficulty),
      partyLevel: z.coerce.number().int().min(1).max(20),
      monsterId: z.string().min(1),
      quantity: z.coerce.number().int().min(1).max(20),
      notes: z.string().optional(),
    })
    .parse({
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      title: formData.get("title"),
      difficulty: formData.get("difficulty"),
      partyLevel: formData.get("partyLevel"),
      monsterId: formData.get("monsterId"),
      quantity: formData.get("quantity"),
      notes: formData.get("notes") || undefined,
    });

  await prisma.encounter.create({
    data: {
      campaignId: payload.campaignId,
      title: payload.title.trim(),
      difficulty: payload.difficulty,
      partyLevel: payload.partyLevel,
      notes: payload.notes?.trim() || null,
      monsters: {
        create: [
          {
            monsterId: payload.monsterId,
            quantity: payload.quantity,
          },
        ],
      },
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function awardLootAction(formData: FormData) {
  await requireDmSession();

  const payload = z
    .object({
      campaignId: z.string().min(1),
      campaignSlug: z.string().min(1),
      characterId: z.string().min(1),
      scope: z.nativeEnum(HoldingScope),
      quantity: z.coerce.number().int().min(0).max(20),
      goldDelta: z.coerce.number().int().min(0).max(100_000),
      note: z.string().min(4),
      customItemName: z.string().optional(),
      customItemDescription: z.string().optional(),
      rarity: z.nativeEnum(LootRarity),
      kind: z.nativeEnum(LootKind),
    })
    .parse({
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      characterId: formData.get("characterId"),
      scope: formData.get("scope"),
      quantity: formData.get("quantity"),
      goldDelta: formData.get("goldDelta"),
      note: formData.get("note"),
      customItemName: formData.get("customItemName") || undefined,
      customItemDescription: formData.get("customItemDescription") || undefined,
      rarity: formData.get("rarity"),
      kind: formData.get("kind"),
    });

  const existingLootItemId = String(formData.get("lootItemId") ?? "").trim();
  let lootItemId: string | null = existingLootItemId || null;

  if (!lootItemId && payload.customItemName?.trim()) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: payload.campaignId,
        name: payload.customItemName.trim(),
        description:
          payload.customItemDescription?.trim() || "Custom DM-authored item.",
        rarity: payload.rarity,
        kind: payload.kind,
      },
    });

    lootItemId = lootItem.id;
  }

  if (!lootItemId && payload.goldDelta <= 0) {
    redirectToCampaign(payload.campaignSlug);
  }

  await prisma.inventoryLedgerEntry.create({
    data: {
      campaignId: payload.campaignId,
      characterId: payload.characterId,
      lootItemId,
      scope: payload.scope,
      entryType: LedgerEntryType.AWARD,
      quantity: lootItemId ? payload.quantity || 1 : 0,
      goldDelta: payload.goldDelta,
      note: payload.note.trim(),
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

const questSchema = z.object({
  campaignId: z.string().min(1),
  campaignSlug: z.string().min(1),
  title: z.string().min(3),
  objective: z.string().min(8),
  rewardGold: z.coerce.number().int().min(0).max(100_000),
  rewardText: z.string().optional(),
  assigneeCharacterId: z.string().optional(),
  notes: z.string().optional(),
});

export async function createQuestAction(formData: FormData) {
  await requireDmSession();

  const payload = questSchema.parse({
    campaignId: formData.get("campaignId"),
    campaignSlug: formData.get("campaignSlug"),
    title: formData.get("title"),
    objective: formData.get("objective"),
    rewardGold: formData.get("rewardGold"),
    rewardText: formData.get("rewardText") || undefined,
    assigneeCharacterId: formData.get("assigneeCharacterId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.quest.create({
    data: {
      campaignId: payload.campaignId,
      title: payload.title.trim(),
      objective: payload.objective.trim(),
      rewardGold: payload.rewardGold,
      rewardText: payload.rewardText?.trim() || null,
      assigneeCharacterId: payload.assigneeCharacterId || null,
      notes: payload.notes?.trim() || null,
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function updateQuestAction(formData: FormData) {
  await requireDmSession();

  const payload = questSchema.extend({
    id: z.string().min(1),
    status: z.nativeEnum(QuestStatus),
  }).parse({
    id: formData.get("id"),
    campaignId: formData.get("campaignId"),
    campaignSlug: formData.get("campaignSlug"),
    title: formData.get("title"),
    objective: formData.get("objective"),
    rewardGold: formData.get("rewardGold"),
    rewardText: formData.get("rewardText") || undefined,
    assigneeCharacterId: formData.get("assigneeCharacterId") || undefined,
    notes: formData.get("notes") || undefined,
    status: formData.get("status"),
  });

  await prisma.quest.update({
    where: {
      id: payload.id,
    },
    data: {
      title: payload.title.trim(),
      objective: payload.objective.trim(),
      rewardGold: payload.rewardGold,
      rewardText: payload.rewardText?.trim() || null,
      assigneeCharacterId: payload.assigneeCharacterId || null,
      notes: payload.notes?.trim() || null,
      status: payload.status,
    },
  });

  redirectToCampaign(payload.campaignSlug);
}

export async function completeQuestAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));

  const quest = await prisma.quest.findUnique({
    where: {
      id,
    },
  });

  if (!quest) {
    redirectToCampaign(campaignSlug);
  }

  if (quest.status !== QuestStatus.COMPLETE) {
    await prisma.quest.update({
      where: {
        id,
      },
      data: {
        status: QuestStatus.COMPLETE,
      },
    });

    if (quest.rewardGold > 0 && quest.assigneeCharacterId) {
      await prisma.inventoryLedgerEntry.create({
        data: {
          campaignId: quest.campaignId,
          characterId: quest.assigneeCharacterId,
          scope: HoldingScope.BANK,
          entryType: LedgerEntryType.QUEST_REWARD,
          quantity: 0,
          goldDelta: quest.rewardGold,
          note: `Quest reward: ${quest.title}`,
        },
      });
    }
  }

  redirectToCampaign(campaignSlug);
}

export async function createStorefrontAction(formData: FormData) {
  await requireDmSession();

  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const name = z.string().min(3).parse(formData.get("name"));
  const description = z.string().min(8).parse(formData.get("description"));

  await prisma.storefront.create({
    data: {
      campaignId,
      name: name.trim(),
      keeperName: readOptionalTextField(formData, "keeperName"),
      description: description.trim(),
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function updateStorefrontAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const status = z.nativeEnum(StorefrontStatus).parse(formData.get("status"));

  await prisma.storefront.update({
    where: {
      id,
    },
    data: {
      name: readTextField(formData, "name"),
      keeperName: readOptionalTextField(formData, "keeperName"),
      description: readTextField(formData, "description"),
      notes: readOptionalTextField(formData, "notes"),
      status,
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function createStorefrontOfferAction(formData: FormData) {
  await requireDmSession();

  const storefrontId = z.string().min(1).parse(formData.get("storefrontId"));
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const itemName = z.string().min(2).parse(formData.get("itemName"));
  const itemDescription = z.string().min(4).parse(formData.get("itemDescription"));
  const rarity = z.nativeEnum(LootRarity).parse(formData.get("rarity"));
  const kind = z.nativeEnum(LootKind).parse(formData.get("kind"));
  const priceGold = z.coerce.number().int().min(0).max(100_000).parse(formData.get("priceGold"));
  const quantity = z.coerce.number().int().min(1).max(999).parse(formData.get("quantity"));

  const lootItemId = readOptionalTextField(formData, "lootItemId") ?? undefined;
  let resolvedLootItemId = lootItemId;

  if (!resolvedLootItemId) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId,
        name: itemName.trim(),
        rarity,
        kind,
        description: itemDescription.trim(),
        sourceTag: "Storefront catalog",
      },
    });

    resolvedLootItemId = lootItem.id;
  }

  await prisma.storefrontOffer.create({
    data: {
      storefrontId,
      lootItemId: resolvedLootItemId,
      itemName: itemName.trim(),
      itemDescription: itemDescription.trim(),
      rarity,
      kind,
      priceGold,
      quantity,
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function recordStorefrontSaleAction(formData: FormData) {
  await requireDmSession();

  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const characterId = z.string().min(1).parse(formData.get("characterId"));
  const scope = z.nativeEnum(HoldingScope).parse(formData.get("scope"));
  const quantity = z.coerce.number().int().min(1).max(20).parse(formData.get("quantity"));
  const note = z.string().min(4).parse(formData.get("note"));

  const offer = await prisma.storefrontOffer.findUnique({
    where: {
      id: offerId,
    },
    include: {
      lootItem: true,
      storefront: true,
    },
  });

  if (!offer || offer.quantity < quantity) {
    redirectToCampaign(campaignSlug);
  }

  let lootItemId = offer.lootItemId;

  if (!lootItemId) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: offer.storefront.campaignId,
        name: offer.itemName,
        rarity: offer.rarity,
        kind: offer.kind,
        description: offer.itemDescription,
        sourceTag: "Storefront sale",
      },
    });

    lootItemId = lootItem.id;
    await prisma.storefrontOffer.update({
      where: {
        id: offerId,
      },
      data: {
        lootItemId,
      },
    });
  }

  await prisma.storefrontOffer.update({
    where: {
      id: offerId,
    },
    data: {
      quantity: offer.quantity - quantity,
    },
  });

  await prisma.inventoryLedgerEntry.create({
    data: {
      campaignId: offer.storefront.campaignId,
      characterId,
      lootItemId,
      scope,
      entryType: LedgerEntryType.PURCHASE,
      quantity,
      goldDelta: -(offer.priceGold * quantity),
      note: note.trim(),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function createMailThreadAction(formData: FormData) {
  await requireDmSession();

  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const subject = z.string().min(3).parse(formData.get("subject"));
  const senderName = z.string().min(2).parse(formData.get("senderName"));
  const recipientName = z.string().min(2).parse(formData.get("recipientName"));
  const body = z.string().min(4).parse(formData.get("body"));

  await prisma.mailThread.create({
    data: {
      campaignId,
      subject: subject.trim(),
      senderName: senderName.trim(),
      recipientName: recipientName.trim(),
      notes: readOptionalTextField(formData, "notes"),
      messages: {
        create: {
          fromName: senderName.trim(),
          toName: recipientName.trim(),
          body: body.trim(),
          isFromDm: true,
        },
      },
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function replyMailThreadAction(formData: FormData) {
  await requireDmSession();

  const threadId = z.string().min(1).parse(formData.get("threadId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const fromName = z.string().min(2).parse(formData.get("fromName"));
  const toName = z.string().min(2).parse(formData.get("toName"));
  const body = z.string().min(4).parse(formData.get("body"));

  await prisma.mailMessage.create({
    data: {
      threadId,
      fromName: fromName.trim(),
      toName: toName.trim(),
      body: body.trim(),
      isFromDm: readBooleanField(formData, "isFromDm"),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function createCraftingRecipeAction(formData: FormData) {
  await requireDmSession();

  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const name = z.string().min(3).parse(formData.get("name"));
  const outputName = z.string().min(3).parse(formData.get("outputName"));
  const outputDescription = z.string().min(4).parse(formData.get("outputDescription"));
  const outputRarity = z.nativeEnum(LootRarity).parse(formData.get("outputRarity"));
  const outputKind = z.nativeEnum(LootKind).parse(formData.get("outputKind"));
  const inputText = z.string().min(3).parse(formData.get("inputText"));
  const goldCost = z.coerce.number().int().min(0).max(100_000).parse(formData.get("goldCost"));

  await prisma.craftingRecipe.create({
    data: {
      campaignId,
      name: name.trim(),
      outputName: outputName.trim(),
      outputDescription: outputDescription.trim(),
      outputRarity,
      outputKind,
      inputText: inputText.trim(),
      goldCost,
      timeText: readOptionalTextField(formData, "timeText"),
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function createCraftingJobAction(formData: FormData) {
  await requireDmSession();

  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const recipeId = z.string().min(1).parse(formData.get("recipeId"));
  const characterId = z.string().min(1).parse(formData.get("characterId"));

  await prisma.craftingJob.create({
    data: {
      campaignId,
      recipeId,
      characterId,
      status: CraftingJobStatus.IN_PROGRESS,
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaignSlug);
}

export async function completeCraftingJobAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const scope = z.nativeEnum(HoldingScope).parse(formData.get("scope"));

  const job = await prisma.craftingJob.findUnique({
    where: {
      id,
    },
    include: {
      recipe: true,
      character: true,
    },
  });

  if (!job || !job.recipe || !job.character) {
    redirectToCampaign(campaignSlug);
  }

  let lootItemId = job.lootItemId;

  if (!lootItemId) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: job.campaignId,
        name: job.recipe.outputName,
        rarity: job.recipe.outputRarity,
        kind: job.recipe.outputKind,
        description: job.recipe.outputDescription,
        sourceTag: "Crafted item",
      },
    });

    lootItemId = lootItem.id;

    await prisma.craftingJob.update({
      where: {
        id: job.id,
      },
      data: {
        lootItemId,
      },
    });
  }

  if (job.status !== CraftingJobStatus.COMPLETE) {
    await prisma.craftingJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: CraftingJobStatus.COMPLETE,
      },
    });

    await prisma.inventoryLedgerEntry.create({
      data: {
        campaignId: job.campaignId,
        characterId: job.character.id,
        lootItemId,
        scope,
        entryType: LedgerEntryType.CRAFTING_OUTPUT,
        quantity: 1,
        goldDelta: -job.recipe.goldCost,
        note: `Crafted ${job.recipe.outputName}`,
      },
    });
  }

  redirectToCampaign(campaignSlug);
}

export async function syncCompendiumAction(formData: FormData) {
  await requireDmSession();

  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const kind = z.enum(["monsters", "magic-items"]).parse(formData.get("kind"));
  const source = z.enum(["OPEN5E", "DND5E"]).parse(formData.get("source"));
  const budget = clampImportBudget({
    pageSize: readOptionalNumberField(formData, "pageSize") ?? undefined,
    pageLimit: readOptionalNumberField(formData, "pageLimit") ?? undefined,
  });

  const result = await importCompendiumBatch({
    source,
    kind,
    budget,
  });
  const campaign = await prisma.campaign.findFirst({
    where: {
      slug: campaignSlug,
    },
    select: {
      id: true,
    },
  });

  if (!campaign) {
    redirectToCampaign(campaignSlug);
  }

  if (kind === "monsters") {
    for (const monster of result.monsters) {
      await prisma.monsterCompendiumEntry.upsert({
        where: {
          campaignId_sourceKey: {
            campaignId: campaign.id,
            sourceKey: monster.sourceKey,
          },
        },
        create: {
          campaignId: campaign.id,
          ...monster,
        },
        update: {
          name: monster.name,
          challengeRating: monster.challengeRating,
          monsterType: monster.monsterType,
          environment: monster.environment,
          tags: monster.tags,
          specialDrops: monster.specialDrops,
          source: monster.source,
          isCustom: monster.isCustom,
          basedOnName: monster.basedOnName,
          notes: monster.notes,
          sourceUrl: monster.sourceUrl,
          sourceDocument: monster.sourceDocument,
        },
      });
    }
  } else {
    for (const item of result.lootItems) {
      await prisma.lootItem.upsert({
        where: {
          campaignId_sourceKey: {
            campaignId: campaign.id,
            sourceKey: item.sourceKey,
          },
        },
        create: {
          campaignId: campaign.id,
          ...item,
          sourceTag: item.sourceTag,
        },
        update: {
          name: item.name,
          rarity: item.rarity,
          kind: item.kind,
          description: item.description,
          sourceTag: item.sourceTag,
          goldValue: item.goldValue,
          sourceUrl: item.sourceUrl,
          sourceDocument: item.sourceDocument,
        },
      });
    }
  }

  revalidatePath("/dm");
  redirect(`/dm?campaign=${campaignSlug}&sync=${kind}&source=${source}`);
}
