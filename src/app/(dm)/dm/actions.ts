"use server";

import {
  EncounterDifficulty,
  HoldingScope,
  LedgerEntryType,
  LootKind,
  LootRarity,
  NpcType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseTagInput } from "@/lib/campaign-vault";
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

function redirectToCampaign(slug: string) {
  revalidatePath("/dm");
  redirect(`/dm?campaign=${slug}`);
}

export async function createNpcAction(formData: FormData) {
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
