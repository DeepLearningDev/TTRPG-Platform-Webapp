"use server";

import { randomInt } from "node:crypto";
import {
  CampaignStatus,
  CraftingResolutionOutcome,
  EncounterDifficulty,
  HoldingScope,
  LedgerEntryType,
  CraftingJobStatus,
  LootKind,
  LootDistributionMode,
  LootReservationEventType,
  LootPoolItemStatus,
  LootPoolRollStatus,
  LootPoolStatus,
  LootRarity,
  NpcType,
  Prisma,
  QuestStatus,
  StorefrontStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { importCompendiumBatch, clampImportBudget } from "@/lib/compendium-source";
import {
  buildCraftingConsumptionPlan,
  deriveCraftingHoldings,
  parseCraftingMaterials,
  resolveCraftingOutcome,
} from "@/lib/crafting-resolution";
import { parseTagInput } from "@/lib/campaign-vault";
import {
  readBooleanField,
  readOptionalNumberField,
  readOptionalTextField,
} from "@/lib/form-fields";
import {
  clearDmSession,
  isValidDmCredential,
  requireDmSession,
  setDmSession,
} from "@/lib/dm-session";
import {
  buildLootPoolDraft,
  runPartyLootRoll,
} from "@/lib/loot-generation";
import { formatHoldingScopeLabel } from "@/lib/format";
import {
  parseLootReservedCharacterName,
  setLootClaimReservation,
} from "@/lib/loot-progress";
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

type CampaignMutationContext = {
  id: string;
  slug: string;
  status: CampaignStatus;
  name: string;
};

function buildLootDeliveryMetadata(input: {
  scope: HoldingScope;
  baseDetail: string;
}) {
  return `${input.baseDetail} Sent to ${formatHoldingScopeLabel(input.scope)}.`;
}

async function findReservationCharacterByName(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    campaignId: string;
    name: string | null;
  },
) {
  const normalized = input.name?.trim();

  if (!normalized) {
    return null;
  }

  return client.character.findFirst({
    where: {
      campaignId: input.campaignId,
      name: {
        equals: normalized,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function createLootReservationEvent(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    campaignId: string;
    lootPoolItemId: string;
    characterId?: string | null;
    eventType: LootReservationEventType;
    actorName?: string | null;
    note: string;
  },
) {
  await client.lootReservationEvent.create({
    data: {
      campaignId: input.campaignId,
      lootPoolItemId: input.lootPoolItemId,
      characterId: input.characterId ?? null,
      eventType: input.eventType,
      actorName: input.actorName ?? null,
      note: input.note,
    },
  });
}

function redirectToCampaign(slug: string): never {
  revalidatePath("/dm");
  redirect(`/dm?campaign=${slug}`);
}

function redirectToCampaignWithMessage(slug: string, key: string, value: string): never {
  revalidatePath("/dm");
  redirect(`/dm?campaign=${slug}&${key}=${value}`);
}

function redirectToCampaignError(
  slug: string | null | undefined,
  error: string,
): never {
  revalidatePath("/dm");
  redirect(slug ? `/dm?campaign=${slug}&error=${error}` : `/dm?error=${error}`);
}

function redirectToDmError(error: string): never {
  revalidatePath("/dm");
  redirect(`/dm?error=${error}`);
}

function slugifyCampaignName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMutationPayload<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  options: {
    campaignSlug?: string;
    error: string;
  },
): z.infer<T> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    redirectToCampaignError(options.campaignSlug, options.error);
  }

  return parsed.data;
}

async function resolveCampaignMutationContext(options: {
  campaignSlug: string;
  campaignId?: string | null;
  allowArchived?: boolean;
}): Promise<CampaignMutationContext> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      slug: options.campaignSlug,
      ...(options.allowArchived ? {} : { status: CampaignStatus.ACTIVE }),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
    },
  });

  if (!campaign) {
    redirectToCampaignError(options.campaignSlug, "invalid-campaign-state");
  }

  if (options.campaignId && options.campaignId !== campaign.id) {
    redirectToCampaignError(campaign.slug, "invalid-campaign-state");
  }

  return campaign;
}

async function resolveLootPoolItemMutationContext(options: {
  campaignSlug: string;
  campaignId?: string | null;
  lootPoolItemId: string;
}) {
  const campaign = await resolveCampaignMutationContext({
    campaignSlug: options.campaignSlug,
    campaignId: options.campaignId,
  });

  const lootPoolItem = await prisma.lootPoolItem.findFirst({
    where: {
      id: options.lootPoolItemId,
      lootPool: {
        campaignId: campaign.id,
      },
    },
    include: {
      lootPool: {
        select: {
          id: true,
          title: true,
          campaignId: true,
          status: true,
        },
      },
      lootItem: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!lootPoolItem) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  if (lootPoolItem.lootPool.status === LootPoolStatus.ARCHIVED) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  return {
    campaign,
    lootPoolItem,
  };
}

async function syncLootPoolResolutionState(lootPoolId: string) {
  const [unresolvedCount, bankedCount] = await Promise.all([
    prisma.lootPoolItem.count({
      where: {
        lootPoolId,
        status: LootPoolItemStatus.UNRESOLVED,
      },
    }),
    prisma.lootPoolItem.count({
      where: {
        lootPoolId,
        status: LootPoolItemStatus.BANKED,
      },
    }),
  ]);

  const nextStatus =
    unresolvedCount > 0
      ? LootPoolStatus.OPEN
      : bankedCount > 0
        ? LootPoolStatus.BANKED
        : LootPoolStatus.RESOLVED;

  await prisma.lootPool.update({
    where: {
      id: lootPoolId,
    },
    data: {
      status: nextStatus,
      resolvedAt: nextStatus === LootPoolStatus.RESOLVED ? new Date() : null,
    },
  });
}

async function ensureLootPoolItemBackedLootItem(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    campaignId: string;
    lootPoolTitle: string;
    lootPoolItem: {
      id: string;
      lootItemId: string | null;
      itemNameSnapshot: string;
      raritySnapshot: LootRarity;
      kindSnapshot: LootKind;
    };
  },
) {
  if (input.lootPoolItem.lootItemId) {
    return input.lootPoolItem.lootItemId;
  }

  const lootItem = await client.lootItem.create({
    data: {
      campaignId: input.campaignId,
      name: input.lootPoolItem.itemNameSnapshot,
      rarity: input.lootPoolItem.raritySnapshot,
      kind: input.lootPoolItem.kindSnapshot,
      description: `Loot pool item generated from ${input.lootPoolTitle}.`,
      sourceTag: "Loot pool",
    },
  });

  await client.lootPoolItem.update({
    where: {
      id: input.lootPoolItem.id,
    },
    data: {
      lootItemId: lootItem.id,
    },
  });

  return lootItem.id;
}

async function ensureUniqueCampaignName(name: string) {
  const existing = await prisma.campaign.findFirst({
    where: {
      name,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    redirectToDmError("duplicate-campaign-name");
  }
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

  const payload = parseMutationPayload(
    z.object({
      name: z.string().min(3),
      setting: z.string().min(6),
      summary: z.string().min(12),
      sessionNight: z.string().optional(),
    }),
    {
      name: formData.get("name"),
      setting: formData.get("setting"),
      summary: formData.get("summary"),
      sessionNight: formData.get("sessionNight") || undefined,
    },
    {
      error: "invalid-campaign-state",
    },
  );

  const baseSlug = slugifyCampaignName(payload.name);

  if (!baseSlug) {
    redirectToDmError("invalid-campaign-name");
  }

  await ensureUniqueCampaignName(payload.name.trim());

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

  const result = await prisma.campaign.updateMany({
    where: {
      id,
      status: CampaignStatus.ACTIVE,
    },
    data: {
      status: CampaignStatus.ARCHIVED,
    },
  });

  if (result.count === 0) {
    redirectToDmError("invalid-campaign-state");
  }

  revalidatePath("/dm");
  redirect("/dm");
}

const pinSchema = z.string().regex(/^\d{4,8}$/);

export async function createCharacterAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const rawCampaignId = String(formData.get("campaignId") ?? "").trim() || null;
  const payload = parseMutationPayload(
    z.object({
      campaignId: z.string().min(1),
      campaignSlug: z.string().min(1),
      name: z.string().min(2),
      classRole: z.string().min(2),
      level: z.coerce.number().int().min(1).max(20),
      playerName: z.string().min(2),
      notes: z.string().optional(),
      pin: pinSchema,
    }),
    {
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      name: formData.get("name"),
      classRole: formData.get("classRole"),
      level: formData.get("level"),
      playerName: formData.get("playerName"),
      notes: formData.get("notes") || undefined,
      pin: formData.get("pin"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-character-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: rawCampaignId || payload.campaignId,
  });

  const duplicateCharacter = await prisma.character.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
    },
    select: {
      id: true,
    },
  });

  if (duplicateCharacter) {
    redirectToCampaignError(campaign.slug, "duplicate-character-name");
  }

  await prisma.character.create({
    data: {
      campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function updateCharacterAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    z.object({
      id: z.string().min(1),
      campaignSlug: z.string().min(1),
      name: z.string().min(2),
      classRole: z.string().min(2),
      level: z.coerce.number().int().min(1).max(20),
      playerName: z.string().min(2),
      notes: z.string().optional(),
      pin: z.string().optional(),
    }),
    {
      id: formData.get("id"),
      campaignSlug: formData.get("campaignSlug"),
      name: formData.get("name"),
      classRole: formData.get("classRole"),
      level: formData.get("level"),
      playerName: formData.get("playerName"),
      notes: formData.get("notes") || undefined,
      pin: formData.get("pin") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-character-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
  });

  const character = await prisma.character.findFirst({
    where: {
      id: payload.id,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-character-state");
  }

  const duplicateCharacter = await prisma.character.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
      id: {
        not: payload.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateCharacter) {
    redirectToCampaignError(campaign.slug, "duplicate-character-name");
  }

  await prisma.character.updateMany({
    where: {
      id: payload.id,
      campaignId: campaign.id,
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
        characterId: character.id,
      },
      create: {
        characterId: character.id,
        pinHash: hashPin(nextPin),
      },
      update: {
        pinHash: hashPin(nextPin),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  redirectToCampaign(campaign.slug);
}

export async function createNpcAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const rawCampaignId = String(formData.get("campaignId") ?? "").trim() || null;
  const payload = parseMutationPayload(
    npcSchema,
    {
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
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-npc-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: rawCampaignId || payload.campaignId,
  });

  const duplicateNpc = await prisma.npc.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
    },
    select: {
      id: true,
    },
  });

  if (duplicateNpc) {
    redirectToCampaignError(campaign.slug, "duplicate-npc-name");
  }

  await prisma.npc.create({
    data: {
      campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function updateNpcAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    npcSchema.extend({ id: z.string().min(1) }),
    {
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
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-npc-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });

  const npc = await prisma.npc.findFirst({
    where: {
      id: payload.id,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!npc) {
    redirectToCampaignError(campaign.slug, "invalid-npc-state");
  }

  const duplicateNpc = await prisma.npc.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
      id: {
        not: payload.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateNpc) {
    redirectToCampaignError(campaign.slug, "duplicate-npc-name");
  }

  await prisma.npc.updateMany({
    where: {
      id: payload.id,
      campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function archiveNpcAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });

  const result = await prisma.npc.updateMany({
    where: {
      id,
      campaignId: campaign.id,
      isArchived: false,
    },
    data: {
      isArchived: true,
    },
  });

  if (result.count === 0) {
    redirectToCampaignError(campaign.slug, "invalid-npc-state");
  }

  redirectToCampaign(campaignSlug);
}

export async function createEncounterAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    z.object({
      campaignId: z.string().min(1),
      campaignSlug: z.string().min(1),
      title: z.string().min(3),
      difficulty: z.nativeEnum(EncounterDifficulty),
      partyLevel: z.coerce.number().int().min(1).max(20),
      monsterId: z.string().min(1),
      quantity: z.coerce.number().int().min(1).max(20),
      notes: z.string().optional(),
    }),
    {
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      title: formData.get("title"),
      difficulty: formData.get("difficulty"),
      partyLevel: formData.get("partyLevel"),
      monsterId: formData.get("monsterId"),
      quantity: formData.get("quantity"),
      notes: formData.get("notes") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-encounter-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });

  const monster = await prisma.monsterCompendiumEntry.findFirst({
    where: {
      id: payload.monsterId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!monster) {
    redirectToCampaignError(campaign.slug, "invalid-encounter-state");
  }

  await prisma.encounter.create({
    data: {
      campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function awardLootAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    z.object({
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
    }),
    {
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
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });

  const character = await prisma.character.findFirst({
    where: {
      id: payload.characterId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-loot-state");
  }

  const existingLootItemId = String(formData.get("lootItemId") ?? "").trim();
  let lootItemId: string | null = existingLootItemId || null;

  if (lootItemId) {
    const existingLootItem = await prisma.lootItem.findFirst({
      where: {
        id: lootItemId,
        campaignId: campaign.id,
      },
      select: {
        id: true,
      },
    });

    if (!existingLootItem) {
      redirectToCampaignError(campaign.slug, "invalid-loot-state");
    }

    if (payload.quantity < 1) {
      redirectToCampaignError(campaign.slug, "invalid-loot-state");
    }
  }

  if (!lootItemId && payload.customItemName?.trim()) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: campaign.id,
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
    redirectToCampaignError(campaign.slug, "invalid-loot-state");
  }

  await prisma.inventoryLedgerEntry.create({
    data: {
      campaignId: campaign.id,
      characterId: payload.characterId,
      lootItemId,
      scope: payload.scope,
      entryType: LedgerEntryType.AWARD,
      quantity: lootItemId ? payload.quantity : 0,
      goldDelta: payload.goldDelta,
      note: payload.note.trim(),
    },
  });

  redirectToCampaign(campaign.slug);
}

const lootPoolGenerationSchema = z.object({
  campaignId: z.string().min(1),
  campaignSlug: z.string().min(1),
  encounterId: z.string().optional(),
  title: z.string().optional(),
  sourceText: z.string().optional(),
  partyLevel: z.coerce.number().int().min(1).max(20).optional(),
  difficulty: z.nativeEnum(EncounterDifficulty).optional(),
  itemCount: z.coerce.number().int().min(1).max(4).optional(),
  includeMonsterMaterials: z.boolean().optional(),
  notes: z.string().optional(),
});

const lootPoolItemMutationSchema = z.object({
  campaignSlug: z.string().min(1),
  campaignId: z.string().optional(),
  lootPoolItemId: z.string().min(1),
});

export async function generateLootPoolAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    lootPoolGenerationSchema,
    {
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      encounterId: readOptionalTextField(formData, "encounterId") || undefined,
      title: readOptionalTextField(formData, "title") || undefined,
      sourceText: readOptionalTextField(formData, "sourceText") || undefined,
      partyLevel: readOptionalNumberField(formData, "partyLevel") ?? undefined,
      difficulty: readOptionalTextField(formData, "difficulty") || undefined,
      itemCount: readOptionalNumberField(formData, "itemCount") ?? undefined,
      includeMonsterMaterials: readBooleanField(formData, "includeMonsterMaterials"),
      notes: readOptionalTextField(formData, "notes") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
  });

  const encounterId = payload.encounterId?.trim() || null;
  const encounter = encounterId
    ? await prisma.encounter.findFirst({
        where: {
          id: encounterId,
          campaignId: campaign.id,
        },
        select: {
          id: true,
          title: true,
          difficulty: true,
          partyLevel: true,
          monsters: {
            include: {
              monster: {
                select: {
                  name: true,
                  monsterType: true,
                  tags: true,
                  specialDrops: true,
                },
              },
            },
          },
        },
      })
    : null;

  if (encounterId && !encounter) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const [candidates, campaignCharacters] = await Promise.all([
    prisma.lootItem.findMany({
      where: {
        campaignId: campaign.id,
      },
      select: {
        id: true,
        name: true,
        rarity: true,
        kind: true,
        updatedAt: true,
        goldValue: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.character.findMany({
      where: {
        campaignId: campaign.id,
      },
      select: {
        level: true,
      },
    }),
  ]);

  const draft = buildLootPoolDraft({
    campaignId: campaign.id,
    campaignName: campaign.name,
    candidates,
    characterLevels: campaignCharacters.map((character) => character.level),
    encounter,
    overrides: {
      title: payload.title,
      sourceText: payload.sourceText,
      partyLevel: payload.partyLevel,
      difficulty: payload.difficulty,
      itemCount: payload.itemCount,
      includeMonsterMaterials: payload.includeMonsterMaterials,
      notes: payload.notes,
    },
  });

  if (draft.items.length === 0) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  await prisma.lootPool.create({
    data: {
      campaignId: campaign.id,
      encounterId: draft.encounterId,
      title: draft.title,
      sourceText: draft.sourceText,
      notes: draft.notes,
      partyLevel: draft.partyLevel,
      difficulty: draft.difficulty,
      status: LootPoolStatus.OPEN,
      items: {
        create: draft.items.map((item) => ({
          ...item,
          distributionMode:
            draft.distributionMode === "ROLL"
              ? LootDistributionMode.ROLL
              : LootDistributionMode.ASSIGN,
        })),
      },
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function assignLootPoolItemAction(formData: FormData) {
  const session = await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    lootPoolItemMutationSchema.extend({
      characterId: z.string().min(1),
      scope: z.nativeEnum(HoldingScope),
      note: z.string().optional(),
    }),
    {
      campaignSlug: formData.get("campaignSlug"),
      campaignId: formData.get("campaignId") || undefined,
      lootPoolItemId: formData.get("lootPoolItemId"),
      characterId: formData.get("characterId"),
      scope: formData.get("scope"),
      note: readOptionalTextField(formData, "note") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const { campaign, lootPoolItem } = await resolveLootPoolItemMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
    lootPoolItemId: payload.lootPoolItemId,
  });

  if (
    lootPoolItem.status !== LootPoolItemStatus.UNRESOLVED &&
    lootPoolItem.status !== LootPoolItemStatus.BANKED
  ) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const character = await prisma.character.findFirst({
    where: {
      id: payload.characterId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const note =
    payload.note?.trim() ||
    `Loot pool assignment from ${lootPoolItem.lootPool.title} to ${character.name}.`;
  const resolvedAt = new Date();
  const reservedForName = parseLootReservedCharacterName(lootPoolItem.resolutionMetadata);

  const assigned = await prisma.$transaction(async (tx) => {
    const lootItemId = await ensureLootPoolItemBackedLootItem(tx, {
      campaignId: campaign.id,
      lootPoolTitle: lootPoolItem.lootPool.title,
      lootPoolItem,
    });

    const updated = await tx.lootPoolItem.updateMany({
      where: {
        id: lootPoolItem.id,
        lootPoolId: lootPoolItem.lootPool.id,
        status: {
          in: [LootPoolItemStatus.UNRESOLVED, LootPoolItemStatus.BANKED],
        },
      },
      data: {
        distributionMode: LootDistributionMode.ASSIGN,
        status: LootPoolItemStatus.ASSIGNED,
        awardedCharacterId: character.id,
        resolutionScope: payload.scope,
        resolutionNote: note,
        resolutionMetadata: buildLootDeliveryMetadata({
          scope: payload.scope,
          baseDetail: `Assigned directly to ${character.name}.`,
        }),
        resolvedAt,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    await tx.inventoryLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        characterId: character.id,
        lootItemId,
        scope: payload.scope,
        entryType: LedgerEntryType.AWARD,
        quantity: lootPoolItem.quantity,
        goldDelta: 0,
        note,
      },
    });

    await tx.lootPoolRollEntry.deleteMany({
      where: {
        lootPoolItemId: lootPoolItem.id,
      },
    });

    if (reservedForName) {
      const reservedCharacter = await findReservationCharacterByName(tx, {
        campaignId: campaign.id,
        name: reservedForName,
      });

      if (reservedCharacter && reservedCharacter.id !== character.id) {
        await createLootReservationEvent(tx, {
          campaignId: campaign.id,
          lootPoolItemId: lootPoolItem.id,
          characterId: reservedCharacter.id,
          eventType: LootReservationEventType.RELEASED,
          actorName: session.username,
          note: `Reservation for ${reservedCharacter.name} was overridden before final delivery.`,
        });
      }

      await createLootReservationEvent(tx, {
        campaignId: campaign.id,
        lootPoolItemId: lootPoolItem.id,
        characterId: character.id,
        eventType: LootReservationEventType.AWARDED,
        actorName: session.username,
        note: `Reservation resolved to ${character.name} via direct assignment to ${formatHoldingScopeLabel(payload.scope)}.`,
      });
    }

    return true;
  });

  if (!assigned) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  await syncLootPoolResolutionState(lootPoolItem.lootPool.id);
  redirectToCampaign(campaign.slug);
}

export async function rollLootPoolItemAction(formData: FormData) {
  const session = await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    lootPoolItemMutationSchema.extend({
      scope: z.nativeEnum(HoldingScope),
      note: z.string().optional(),
    }),
    {
      campaignSlug: formData.get("campaignSlug"),
      campaignId: formData.get("campaignId") || undefined,
      lootPoolItemId: formData.get("lootPoolItemId"),
      scope: formData.get("scope"),
      note: readOptionalTextField(formData, "note") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const { campaign, lootPoolItem } = await resolveLootPoolItemMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
    lootPoolItemId: payload.lootPoolItemId,
  });

  if (
    lootPoolItem.status !== LootPoolItemStatus.UNRESOLVED &&
    lootPoolItem.status !== LootPoolItemStatus.BANKED
  ) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const characters = await prisma.character.findMany({
    where: {
      campaignId: campaign.id,
    },
    select: {
      id: true,
      name: true,
      level: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (characters.length === 0) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const rollResult = runPartyLootRoll(characters, () => randomInt(1, 21));
  const note =
    payload.note?.trim() || `${lootPoolItem.lootPool.title}: ${rollResult.summary}`;
  const resolvedAt = new Date();
  const reservedForName = parseLootReservedCharacterName(lootPoolItem.resolutionMetadata);

  const rolled = await prisma.$transaction(async (tx) => {
    const lootItemId = await ensureLootPoolItemBackedLootItem(tx, {
      campaignId: campaign.id,
      lootPoolTitle: lootPoolItem.lootPool.title,
      lootPoolItem,
    });

    const updated = await tx.lootPoolItem.updateMany({
      where: {
        id: lootPoolItem.id,
        lootPoolId: lootPoolItem.lootPool.id,
        status: {
          in: [LootPoolItemStatus.UNRESOLVED, LootPoolItemStatus.BANKED],
        },
      },
      data: {
        distributionMode: LootDistributionMode.ROLL,
        status: LootPoolItemStatus.ROLLED,
        awardedCharacterId: rollResult.winner.id,
        resolutionScope: payload.scope,
        resolutionNote: note,
        resolutionMetadata: buildLootDeliveryMetadata({
          scope: payload.scope,
          baseDetail: rollResult.summary,
        }),
        resolvedAt,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    await tx.lootPoolRollEntry.deleteMany({
      where: {
        lootPoolItemId: lootPoolItem.id,
      },
    });

    await tx.lootPoolRollEntry.createMany({
      data: rollResult.rolls.map((entry) => ({
        lootPoolItemId: lootPoolItem.id,
        characterId: entry.id,
        rollTotal: entry.roll,
        status:
          entry.id === rollResult.winner.id
            ? LootPoolRollStatus.WON
            : LootPoolRollStatus.LOST,
      })),
    });

    await tx.inventoryLedgerEntry.create({
      data: {
        campaignId: campaign.id,
        characterId: rollResult.winner.id,
        lootItemId,
        scope: payload.scope,
        entryType: LedgerEntryType.AWARD,
        quantity: lootPoolItem.quantity,
        goldDelta: 0,
        note,
      },
    });

    if (reservedForName) {
      const reservedCharacter = await findReservationCharacterByName(tx, {
        campaignId: campaign.id,
        name: reservedForName,
      });

      if (reservedCharacter && reservedCharacter.id !== rollResult.winner.id) {
        await createLootReservationEvent(tx, {
          campaignId: campaign.id,
          lootPoolItemId: lootPoolItem.id,
          characterId: reservedCharacter.id,
          eventType: LootReservationEventType.RELEASED,
          actorName: session.username,
          note: `Reservation for ${reservedCharacter.name} was released by a party roll.`,
        });
      }

      await createLootReservationEvent(tx, {
        campaignId: campaign.id,
        lootPoolItemId: lootPoolItem.id,
        characterId: rollResult.winner.id,
        eventType: LootReservationEventType.AWARDED,
        actorName: session.username,
        note: `Reservation resolved to ${rollResult.winner.name} via party roll to ${formatHoldingScopeLabel(payload.scope)}.`,
      });
    }

    return true;
  });

  if (!rolled) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  await syncLootPoolResolutionState(lootPoolItem.lootPool.id);
  redirectToCampaign(campaign.slug);
}

export async function deferLootPoolItemAction(formData: FormData) {
  const session = await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    lootPoolItemMutationSchema.extend({
      status: z.enum([LootPoolItemStatus.UNRESOLVED, LootPoolItemStatus.BANKED]),
      note: z.string().optional(),
    }),
    {
      campaignSlug: formData.get("campaignSlug"),
      campaignId: formData.get("campaignId") || undefined,
      lootPoolItemId: formData.get("lootPoolItemId"),
      status: formData.get("status"),
      note: readOptionalTextField(formData, "note") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const { campaign, lootPoolItem } = await resolveLootPoolItemMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
    lootPoolItemId: payload.lootPoolItemId,
  });

  if (
    lootPoolItem.status !== LootPoolItemStatus.UNRESOLVED &&
    lootPoolItem.status !== LootPoolItemStatus.BANKED
  ) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const reservedForName = parseLootReservedCharacterName(lootPoolItem.resolutionMetadata);

  const deferred = await prisma.$transaction(async (tx) => {
    const updated = await tx.lootPoolItem.updateMany({
      where: {
        id: lootPoolItem.id,
        lootPoolId: lootPoolItem.lootPool.id,
        status: {
          in: [LootPoolItemStatus.UNRESOLVED, LootPoolItemStatus.BANKED],
        },
      },
      data: {
        distributionMode:
          payload.status === LootPoolItemStatus.BANKED
            ? LootDistributionMode.BANK
            : LootDistributionMode.ASSIGN,
        status: payload.status,
        awardedCharacterId: null,
        resolutionScope: null,
        resolutionNote:
          payload.note?.trim() ||
          (payload.status === LootPoolItemStatus.BANKED
            ? "Held for later party distribution."
            : "Returned to unresolved party loot."),
        resolutionMetadata: null,
        resolvedAt: null,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    await tx.lootPoolRollEntry.deleteMany({
      where: {
        lootPoolItemId: lootPoolItem.id,
      },
    });

    if (reservedForName) {
      const reservedCharacter = await findReservationCharacterByName(tx, {
        campaignId: campaign.id,
        name: reservedForName,
      });

      await createLootReservationEvent(tx, {
        campaignId: campaign.id,
        lootPoolItemId: lootPoolItem.id,
        characterId: reservedCharacter?.id ?? null,
        eventType: LootReservationEventType.CLEARED,
        actorName: session.username,
        note:
          payload.status === LootPoolItemStatus.BANKED
            ? `Reservation for ${reservedForName} was cleared and the item returned to the banked pool.`
            : `Reservation for ${reservedForName} was cleared and the item returned to unresolved loot.`,
      });
    }

    return true;
  });

  if (!deferred) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  await syncLootPoolResolutionState(lootPoolItem.lootPool.id);
  redirectToCampaign(campaign.slug);
}

export async function bankLootPoolItemAction(formData: FormData) {
  const nextFormData = new FormData();

  for (const [key, value] of formData.entries()) {
    nextFormData.append(key, value);
  }

  nextFormData.set("status", LootPoolItemStatus.BANKED);

  return deferLootPoolItemAction(nextFormData);
}

export async function reserveLootPoolItemAction(formData: FormData) {
  const session = await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    lootPoolItemMutationSchema.extend({
      characterId: z.string().optional(),
    }),
    {
      campaignSlug: formData.get("campaignSlug"),
      campaignId: formData.get("campaignId") || undefined,
      lootPoolItemId: formData.get("lootPoolItemId"),
      characterId: readOptionalTextField(formData, "characterId") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const { campaign, lootPoolItem } = await resolveLootPoolItemMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
    lootPoolItemId: payload.lootPoolItemId,
  });

  if (
    lootPoolItem.status !== LootPoolItemStatus.BANKED ||
    lootPoolItem.distributionMode !== LootDistributionMode.BANK
  ) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const character = payload.characterId
    ? await prisma.character.findFirst({
        where: {
          id: payload.characterId,
          campaignId: campaign.id,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  if (payload.characterId && !character) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  const previousReservedForName = parseLootReservedCharacterName(lootPoolItem.resolutionMetadata);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRecord = await tx.lootPoolItem.updateMany({
      where: {
        id: lootPoolItem.id,
        lootPoolId: lootPoolItem.lootPool.id,
        status: LootPoolItemStatus.BANKED,
        distributionMode: LootDistributionMode.BANK,
        awardedCharacterId: null,
      },
      data: {
        resolutionMetadata: setLootClaimReservation({
          metadata: lootPoolItem.resolutionMetadata,
          reservedForName: character?.name ?? null,
        }),
        resolutionNote: character
          ? `Reserved for ${character.name} pending final delivery.`
          : "Reservation cleared.",
      },
    });

    if (updatedRecord.count === 0) {
      return 0;
    }

    const previousReservedCharacter = await findReservationCharacterByName(tx, {
      campaignId: campaign.id,
      name: previousReservedForName,
    });

    if (previousReservedForName && (!character || previousReservedForName !== character.name)) {
      await createLootReservationEvent(tx, {
        campaignId: campaign.id,
        lootPoolItemId: lootPoolItem.id,
        characterId: previousReservedCharacter?.id ?? null,
        eventType: LootReservationEventType.CLEARED,
        actorName: session.username,
        note: `Reservation for ${previousReservedForName} was cleared.`,
      });
    }

    if (character && previousReservedForName !== character.name) {
      await createLootReservationEvent(tx, {
        campaignId: campaign.id,
        lootPoolItemId: lootPoolItem.id,
        characterId: character.id,
        eventType: LootReservationEventType.RESERVED,
        actorName: session.username,
        note: `Item reserved for ${character.name}.`,
      });
    }

    return updatedRecord.count;
  });

  if (updated === 0) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  revalidatePath("/bank/account");
  redirectToCampaign(campaign.slug);
}

export async function finalizeLootPoolAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    z.object({
      campaignId: z.string().min(1),
      campaignSlug: z.string().min(1),
      lootPoolId: z.string().min(1),
    }),
    {
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      lootPoolId: formData.get("lootPoolId"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-loot-pool-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId,
  });

  const lootPool = await prisma.lootPool.findFirst({
    where: {
      id: payload.lootPoolId,
      campaignId: campaign.id,
    },
    include: {
      items: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!lootPool) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  if (lootPool.items.some((item) => item.status === LootPoolItemStatus.UNRESOLVED)) {
    redirectToCampaignError(campaign.slug, "invalid-loot-pool-state");
  }

  await prisma.lootPool.update({
    where: {
      id: lootPool.id,
    },
    data: {
      status: LootPoolStatus.ARCHIVED,
      resolvedAt: lootPool.resolvedAt ?? new Date(),
    },
  });

  redirectToCampaign(campaign.slug);
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

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    questSchema,
    {
      campaignId: formData.get("campaignId"),
      campaignSlug: formData.get("campaignSlug"),
      title: formData.get("title"),
      objective: formData.get("objective"),
      rewardGold: formData.get("rewardGold"),
      rewardText: formData.get("rewardText") || undefined,
      assigneeCharacterId: formData.get("assigneeCharacterId") || undefined,
      notes: formData.get("notes") || undefined,
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-quest-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });

  if (payload.assigneeCharacterId) {
    const assignee = await prisma.character.findFirst({
      where: {
        id: payload.assigneeCharacterId,
        campaignId: campaign.id,
      },
      select: {
        id: true,
      },
    });

    if (!assignee) {
      redirectToCampaignError(campaign.slug, "invalid-quest-state");
    }
  }

  const duplicateQuest = await prisma.quest.findFirst({
    where: {
      campaignId: campaign.id,
      title: payload.title.trim(),
    },
    select: {
      id: true,
    },
  });

  if (duplicateQuest) {
    redirectToCampaignError(campaign.slug, "duplicate-quest-title");
  }

  await prisma.quest.create({
    data: {
      campaignId: campaign.id,
      title: payload.title.trim(),
      objective: payload.objective.trim(),
      rewardGold: payload.rewardGold,
      rewardText: payload.rewardText?.trim() || null,
      assigneeCharacterId: payload.assigneeCharacterId || null,
      notes: payload.notes?.trim() || null,
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function updateQuestAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    questSchema.extend({
      id: z.string().min(1),
      status: z.nativeEnum(QuestStatus),
    }),
    {
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
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-quest-state",
    },
  );

  const campaign = await resolveCampaignMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });

  const quest = await prisma.quest.findFirst({
    where: {
      id: payload.id,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!quest) {
    redirectToCampaignError(campaign.slug, "invalid-quest-state");
  }

  if (payload.assigneeCharacterId) {
    const assignee = await prisma.character.findFirst({
      where: {
        id: payload.assigneeCharacterId,
        campaignId: campaign.id,
      },
      select: {
        id: true,
      },
    });

    if (!assignee) {
      redirectToCampaignError(campaign.slug, "invalid-quest-state");
    }
  }

  const duplicateQuest = await prisma.quest.findFirst({
    where: {
      campaignId: campaign.id,
      title: payload.title.trim(),
      id: {
        not: payload.id,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateQuest) {
    redirectToCampaignError(campaign.slug, "duplicate-quest-title");
  }

  await prisma.quest.updateMany({
    where: {
      id: payload.id,
      campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function completeQuestAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });

  const quest = await prisma.quest.findFirst({
    where: {
      id,
      campaignId: campaign.id,
    },
  });

  if (!quest) {
    redirectToCampaignError(campaign.slug, "invalid-quest-state");
  }

  if (quest.status !== QuestStatus.COMPLETE) {
    await prisma.quest.updateMany({
      where: {
        id,
        campaignId: campaign.id,
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

  redirectToCampaign(campaign.slug);
}

export async function createStorefrontAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });
  const payload = parseMutationPayload(
    z.object({
      name: z.string().min(3),
      description: z.string().min(8),
    }),
    {
      name: formData.get("name"),
      description: formData.get("description"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-storefront-state",
    },
  );

  const duplicateStorefront = await prisma.storefront.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
    },
    select: {
      id: true,
    },
  });

  if (duplicateStorefront) {
    redirectToCampaignError(campaign.slug, "duplicate-storefront-name");
  }

  await prisma.storefront.create({
    data: {
      campaignId: campaign.id,
      name: payload.name.trim(),
      keeperName: readOptionalTextField(formData, "keeperName"),
      description: payload.description.trim(),
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function updateStorefrontAction(formData: FormData) {
  await requireDmSession();

  const id = z.string().min(1).parse(formData.get("id"));
  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });
  const payload = parseMutationPayload(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      status: z.nativeEnum(StorefrontStatus),
    }),
    {
      name: formData.get("name"),
      description: formData.get("description"),
      status: formData.get("status"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-storefront-state",
    },
  );

  const storefront = await prisma.storefront.findFirst({
    where: {
      id,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!storefront) {
    redirectToCampaignError(campaign.slug, "invalid-storefront-state");
  }

  const duplicateStorefront = await prisma.storefront.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
      id: {
        not: id,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateStorefront) {
    redirectToCampaignError(campaign.slug, "duplicate-storefront-name");
  }

  await prisma.storefront.updateMany({
    where: {
      id,
      campaignId: campaign.id,
    },
    data: {
      name: payload.name.trim(),
      keeperName: readOptionalTextField(formData, "keeperName"),
      description: payload.description.trim(),
      notes: readOptionalTextField(formData, "notes"),
      status: payload.status,
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function createStorefrontOfferAction(formData: FormData) {
  await requireDmSession();

  const storefrontId = z.string().min(1).parse(formData.get("storefrontId"));
  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });
  const payload = parseMutationPayload(
    z.object({
      itemName: z.string().min(2),
      itemDescription: z.string().min(4),
      rarity: z.nativeEnum(LootRarity),
      kind: z.nativeEnum(LootKind),
      priceGold: z.coerce.number().int().min(0).max(100_000),
      quantity: z.coerce.number().int().min(1).max(999),
    }),
    {
      itemName: formData.get("itemName"),
      itemDescription: formData.get("itemDescription"),
      rarity: formData.get("rarity"),
      kind: formData.get("kind"),
      priceGold: formData.get("priceGold"),
      quantity: formData.get("quantity"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-storefront-state",
    },
  );

  const storefront = await prisma.storefront.findFirst({
    where: {
      id: storefrontId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!storefront) {
    redirectToCampaignError(campaign.slug, "invalid-storefront-state");
  }

  const lootItemId = readOptionalTextField(formData, "lootItemId") ?? undefined;
  let resolvedLootItemId = lootItemId;

  if (!resolvedLootItemId) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: campaign.id,
        name: payload.itemName.trim(),
        rarity: payload.rarity,
        kind: payload.kind,
        description: payload.itemDescription.trim(),
        sourceTag: "Storefront catalog",
      },
    });

    resolvedLootItemId = lootItem.id;
  } else {
    const existingLootItem = await prisma.lootItem.findFirst({
      where: {
        id: resolvedLootItemId,
        campaignId: campaign.id,
      },
      select: {
        id: true,
      },
    });

    if (!existingLootItem) {
      redirectToCampaignError(campaign.slug, "invalid-storefront-state");
    }
  }

  await prisma.storefrontOffer.create({
    data: {
      storefrontId,
      lootItemId: resolvedLootItemId,
      itemName: payload.itemName.trim(),
      itemDescription: payload.itemDescription.trim(),
      rarity: payload.rarity,
      kind: payload.kind,
      priceGold: payload.priceGold,
      quantity: payload.quantity,
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function recordStorefrontSaleAction(formData: FormData) {
  await requireDmSession();

  const offerId = z.string().min(1).parse(formData.get("offerId"));
  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });
  const payload = parseMutationPayload(
    z.object({
      characterId: z.string().min(1),
      scope: z.nativeEnum(HoldingScope),
      quantity: z.coerce.number().int().min(1).max(20),
      note: z.string().min(4),
    }),
    {
      characterId: formData.get("characterId"),
      scope: formData.get("scope"),
      quantity: formData.get("quantity"),
      note: formData.get("note"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-storefront-state",
    },
  );

  const character = await prisma.character.findFirst({
    where: {
      id: payload.characterId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-storefront-state");
  }

  const offer = await prisma.storefrontOffer.findFirst({
    where: {
      id: offerId,
      storefront: {
        campaignId: campaign.id,
      },
    },
    include: {
      lootItem: true,
      storefront: true,
    },
  });

  if (!offer || offer.quantity < payload.quantity) {
    redirectToCampaignError(campaign.slug, "invalid-storefront-state");
  }

  let lootItemId = offer.lootItemId;

  if (!lootItemId) {
    const lootItem = await prisma.lootItem.create({
      data: {
        campaignId: campaign.id,
        name: offer.itemName,
        rarity: offer.rarity,
        kind: offer.kind,
        description: offer.itemDescription,
        sourceTag: "Storefront sale",
      },
    });

    lootItemId = lootItem.id;
    await prisma.storefrontOffer.updateMany({
      where: {
        id: offerId,
        storefrontId: offer.storefrontId,
      },
      data: {
        lootItemId,
      },
    });
  }

  await prisma.storefrontOffer.updateMany({
    where: {
      id: offerId,
      storefrontId: offer.storefrontId,
    },
    data: {
      quantity: offer.quantity - payload.quantity,
    },
  });

  await prisma.inventoryLedgerEntry.create({
    data: {
      campaignId: campaign.id,
      characterId: payload.characterId,
      lootItemId,
      scope: payload.scope,
      entryType: LedgerEntryType.PURCHASE,
      quantity: payload.quantity,
      goldDelta: -(offer.priceGold * payload.quantity),
      note: payload.note.trim(),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function createMailThreadAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });
  const payload = parseMutationPayload(
    z.object({
      subject: z.string().min(3),
      senderName: z.string().min(2),
      recipientName: z.string().min(2),
      body: z.string().min(4),
    }),
    {
      subject: formData.get("subject"),
      senderName: formData.get("senderName"),
      recipientName: formData.get("recipientName"),
      body: formData.get("body"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-mail-state",
    },
  );

  await prisma.mailThread.create({
    data: {
      campaignId: campaign.id,
      subject: payload.subject.trim(),
      senderName: payload.senderName.trim(),
      recipientName: payload.recipientName.trim(),
      notes: readOptionalTextField(formData, "notes"),
      messages: {
        create: {
          fromName: payload.senderName.trim(),
          toName: payload.recipientName.trim(),
          body: payload.body.trim(),
          isFromDm: true,
        },
      },
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function nudgeStaleReservationAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const payload = parseMutationPayload(
    z.object({
      campaignSlug: z.string().min(1),
      campaignId: z.string().optional(),
      lootPoolItemId: z.string().min(1),
    }),
    {
      campaignSlug: formData.get("campaignSlug"),
      campaignId: formData.get("campaignId") || undefined,
      lootPoolItemId: formData.get("lootPoolItemId"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-mail-state",
    },
  );

  const { campaign, lootPoolItem } = await resolveLootPoolItemMutationContext({
    campaignSlug: payload.campaignSlug.trim(),
    campaignId: payload.campaignId?.trim() || null,
    lootPoolItemId: payload.lootPoolItemId,
  });

  const reservedForName = parseLootReservedCharacterName(lootPoolItem.resolutionMetadata);

  if (!reservedForName) {
    redirectToCampaignError(campaign.slug, "invalid-mail-state");
  }

  const character = await prisma.character.findFirst({
    where: {
      campaignId: campaign.id,
      name: reservedForName,
    },
    select: {
      id: true,
      name: true,
      playerName: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-mail-state");
  }

  const reservedDays = Math.floor(
    Math.max(0, Date.now() - lootPoolItem.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const sourceText = lootPoolItem.lootPool.title;

  await prisma.mailThread.create({
    data: {
      campaignId: campaign.id,
      subject: `Loot follow-up: ${lootPoolItem.itemNameSnapshot}`,
      senderName: "DM",
      recipientName: character.name,
      notes: "Auto-created from the stale reservation nudge action.",
      messages: {
        create: {
          fromName: "DM",
          toName: character.name,
          body:
            `${lootPoolItem.itemNameSnapshot} from ${sourceText} is still reserved for you.` +
            ` It has been waiting ${reservedDays} day${reservedDays === 1 ? "" : "s"}.` +
            " Reply if you still want it banked or are ready for final delivery.",
          isFromDm: true,
        },
      },
    },
  });

  redirectToCampaignWithMessage(campaign.slug, "mail", "nudged");
}

export async function replyMailThreadAction(formData: FormData) {
  await requireDmSession();

  const threadId = z.string().min(1).parse(formData.get("threadId"));
  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });
  const payload = parseMutationPayload(
    z.object({
      fromName: z.string().min(2),
      toName: z.string().min(2),
      body: z.string().min(4),
    }),
    {
      fromName: formData.get("fromName"),
      toName: formData.get("toName"),
      body: formData.get("body"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-mail-state",
    },
  );

  const thread = await prisma.mailThread.findFirst({
    where: {
      id: threadId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!thread) {
    redirectToCampaignError(campaign.slug, "invalid-mail-state");
  }

  await prisma.mailMessage.create({
    data: {
      threadId,
      fromName: payload.fromName.trim(),
      toName: payload.toName.trim(),
      body: payload.body.trim(),
      isFromDm: readBooleanField(formData, "isFromDm"),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function createCraftingRecipeAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });
  const payload = parseMutationPayload(
    z.object({
      name: z.string().min(3),
      outputName: z.string().min(3),
      outputDescription: z.string().min(4),
      outputRarity: z.nativeEnum(LootRarity),
      outputKind: z.nativeEnum(LootKind),
      inputText: z.string().min(3),
      materialsText: z.string().min(3),
      goldCost: z.coerce.number().int().min(0).max(100_000),
    }),
    {
      name: formData.get("name"),
      outputName: formData.get("outputName"),
      outputDescription: formData.get("outputDescription"),
      outputRarity: formData.get("outputRarity"),
      outputKind: formData.get("outputKind"),
      inputText: formData.get("inputText"),
      materialsText: formData.get("materialsText"),
      goldCost: formData.get("goldCost"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-crafting-state",
    },
  );

  const duplicateRecipe = await prisma.craftingRecipe.findFirst({
    where: {
      campaignId: campaign.id,
      name: payload.name.trim(),
    },
    select: {
      id: true,
    },
  });

  if (duplicateRecipe) {
    redirectToCampaignError(campaign.slug, "duplicate-recipe-name");
  }

  const materials = parseCraftingMaterials(payload.materialsText);

  if (materials.length === 0) {
    redirectToCampaignError(campaign.slug, "invalid-crafting-state");
  }

  await prisma.craftingRecipe.create({
    data: {
      campaignId: campaign.id,
      name: payload.name.trim(),
      outputName: payload.outputName.trim(),
      outputDescription: payload.outputDescription.trim(),
      outputRarity: payload.outputRarity,
      outputKind: payload.outputKind,
      inputText: payload.inputText.trim(),
      materialsText: payload.materialsText.trim(),
      goldCost: payload.goldCost,
      timeText: readOptionalTextField(formData, "timeText"),
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function createCraftingJobAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
    campaignId: String(formData.get("campaignId") ?? "").trim() || null,
  });
  const payload = parseMutationPayload(
    z.object({
      recipeId: z.string().min(1),
      characterId: z.string().min(1),
    }),
    {
      recipeId: formData.get("recipeId"),
      characterId: formData.get("characterId"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-crafting-state",
    },
  );

  const recipe = await prisma.craftingRecipe.findFirst({
    where: {
      id: payload.recipeId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!recipe) {
    redirectToCampaignError(campaign.slug, "invalid-crafting-state");
  }

  const character = await prisma.character.findFirst({
    where: {
      id: payload.characterId,
      campaignId: campaign.id,
    },
    select: {
      id: true,
    },
  });

  if (!character) {
    redirectToCampaignError(campaign.slug, "invalid-crafting-state");
  }

  await prisma.craftingJob.create({
    data: {
      campaignId: campaign.id,
      recipeId: payload.recipeId,
      characterId: payload.characterId,
      status: CraftingJobStatus.IN_PROGRESS,
      notes: readOptionalTextField(formData, "notes"),
    },
  });

  redirectToCampaign(campaign.slug);
}

export async function completeCraftingJobAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const id = z.string().min(1).parse(formData.get("id"));
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });
  const payload = parseMutationPayload(
    z.object({
      scope: z.nativeEnum(HoldingScope),
    }),
    {
      scope: formData.get("scope"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-crafting-state",
    },
  );

  const job = await prisma.craftingJob.findFirst({
    where: {
      id,
      campaignId: campaign.id,
    },
    include: {
      recipe: true,
      character: {
        include: {
          ledgerEntries: {
            include: {
              lootItem: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!job || !job.recipe || !job.character || job.status !== CraftingJobStatus.IN_PROGRESS) {
    redirectToCampaignError(campaign.slug, "invalid-crafting-state");
  }

  const recipe = job.recipe;
  const character = job.character;
  const requirements = parseCraftingMaterials(recipe.materialsText);
  const holdings = deriveCraftingHoldings(character.ledgerEntries);
  const materialSummary = requirements.length
    ? buildCraftingConsumptionPlan(requirements, holdings, "full")
    : { isMet: true, consumption: [] };

  if (!materialSummary.isMet) {
    redirectToCampaignError(campaign.slug, "insufficient-crafting-materials");
  }

  const resolution = resolveCraftingOutcome({
    level: character.level,
    rarity: recipe.outputRarity,
    outputName: recipe.outputName,
    dieRoll: randomInt(1, 21),
  });
  const outcomeKey = resolution.outcome.toLowerCase();
  const consumptionPlan = buildCraftingConsumptionPlan(
    requirements,
    holdings,
    resolution.outcome === CraftingResolutionOutcome.FAILURE ? "failure" : "full",
  );

  if (!consumptionPlan.isMet) {
    redirectToCampaignError(campaign.slug, "insufficient-crafting-materials");
  }

  const resolutionText = `Roll ${resolution.dieRoll} + ${resolution.skillBonus} = ${resolution.total} vs DC ${resolution.dc}. ${resolution.resolutionText}`;

  await prisma.$transaction(async (tx) => {
    let lootItemId = job.lootItemId;

    for (const material of consumptionPlan.consumption) {
      await tx.inventoryLedgerEntry.create({
        data: {
          campaignId: campaign.id,
          characterId: character.id,
          lootItemId: material.lootItemId,
          scope: material.scope,
          entryType: LedgerEntryType.CRAFTING_INPUT,
          quantity: -material.quantity,
          note: `Spent ${material.quantity}x ${material.name} on ${recipe.outputName} (${outcomeKey} result)`,
        },
      });
    }

    if (resolution.outcome !== CraftingResolutionOutcome.FAILURE) {
      if (!lootItemId) {
        const lootItem = await tx.lootItem.create({
          data: {
            campaignId: campaign.id,
            name: recipe.outputName,
            rarity: recipe.outputRarity,
            kind: recipe.outputKind,
            description: recipe.outputDescription,
            sourceTag: "Crafted item",
          },
        });

        lootItemId = lootItem.id;
      }

      if (recipe.goldCost > 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            campaignId: campaign.id,
            characterId: character.id,
            scope: HoldingScope.BANK,
            entryType: LedgerEntryType.CRAFTING_INPUT,
            goldDelta: -recipe.goldCost,
            note: `Spent ${recipe.outputName} crafting costs (${outcomeKey} result)`,
          },
        });
      }

      await tx.inventoryLedgerEntry.create({
        data: {
          campaignId: campaign.id,
          characterId: character.id,
          lootItemId,
          scope: payload.scope,
          entryType: LedgerEntryType.CRAFTING_OUTPUT,
          quantity: 1,
          note:
            resolution.outcome === CraftingResolutionOutcome.MIXED
              ? `Crafted ${recipe.outputName} with a mixed result`
              : `Crafted ${recipe.outputName}`,
        },
      });
    }

    await tx.craftingJob.update({
      where: {
        id: job.id,
      },
      data: {
        lootItemId,
        status: CraftingJobStatus.COMPLETE,
        resolutionOutcome: resolution.outcome,
        resolutionText,
        rollDie: resolution.dieRoll,
        rollTotal: resolution.total,
        resolvedAt: new Date(),
      },
    });
  });

  redirectToCampaign(campaign.slug);
}

export async function syncCompendiumAction(formData: FormData) {
  await requireDmSession();

  const rawCampaignSlug = String(formData.get("campaignSlug") ?? "").trim();
  const campaignSlug = z.string().min(1).parse(formData.get("campaignSlug"));
  const campaign = await resolveCampaignMutationContext({
    campaignSlug,
  });
  const payload = parseMutationPayload(
    z.object({
      kind: z.enum(["monsters", "magic-items"]),
      source: z.enum(["OPEN5E", "DND5E"]),
    }),
    {
      kind: formData.get("kind"),
      source: formData.get("source"),
    },
    {
      campaignSlug: rawCampaignSlug,
      error: "invalid-campaign-state",
    },
  );
  const budget = clampImportBudget({
    pageSize: readOptionalNumberField(formData, "pageSize") ?? undefined,
    pageLimit: readOptionalNumberField(formData, "pageLimit") ?? undefined,
  });

  const result = await importCompendiumBatch({
    source: payload.source,
    kind: payload.kind,
    budget,
  });

  if (payload.kind === "monsters") {
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
  redirect(`/dm?campaign=${campaign.slug}&sync=${payload.kind}&source=${payload.source}`);
}
