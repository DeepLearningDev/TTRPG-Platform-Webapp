import { CampaignStatus, HoldingScope, NpcType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitTags } from "@/lib/format";

const dashboardInclude = {
  characters: {
    include: {
      bankAccess: true,
      ledgerEntries: {
        include: {
          lootItem: true,
        },
        orderBy: {
          createdAt: "desc" as const,
        },
      },
    },
  },
  npcs: {
    where: {
      isArchived: false,
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  encounters: {
    include: {
      monsters: {
        include: {
          monster: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  monsters: {
    orderBy: [{ isCustom: "desc" as const }, { name: "asc" as const }],
  },
  lootItems: {
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  lootPools: {
    include: {
      encounter: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          partyLevel: true,
        },
      },
      items: {
        include: {
          lootItem: true,
          awardedCharacter: true,
          rollEntries: {
            include: {
              character: true,
            },
            orderBy: {
              createdAt: "asc" as const,
            },
          },
        },
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  quests: {
    include: {
      assignee: true,
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  storefronts: {
    include: {
      offers: {
        include: {
          lootItem: true,
        },
        orderBy: {
          updatedAt: "desc" as const,
        },
      },
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  mailThreads: {
    include: {
      messages: {
        orderBy: {
          createdAt: "asc" as const,
        },
      },
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  craftingRecipes: {
    include: {
      jobs: {
        include: {
          character: true,
          lootItem: true,
        },
        orderBy: {
          updatedAt: "desc" as const,
        },
      },
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  craftingJobs: {
    include: {
      recipe: true,
      character: true,
      lootItem: true,
    },
    orderBy: {
      updatedAt: "desc" as const,
    },
  },
  ledgerEntries: {
    include: {
      character: true,
      lootItem: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 12,
  },
} satisfies Prisma.CampaignInclude;

export async function getCampaignOptions() {
  return prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      setting: true,
      status: true,
      sessionNight: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getDashboardData(options?: {
  slug?: string;
  monsterQuery?: string;
}) {
  const campaigns = await getCampaignOptions();
  const selectedCampaign =
    campaigns.find((campaign) => campaign.slug === options?.slug) ?? campaigns[0];

  if (!selectedCampaign) {
    return null;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: selectedCampaign.id,
    },
    include: dashboardInclude,
  });

  if (!campaign) {
    return null;
  }

  const monsterQuery = options?.monsterQuery?.trim().toLowerCase() ?? "";
  const filteredMonsters = monsterQuery
    ? campaign.monsters.filter((monster) => {
        const haystack = [
          monster.name,
          monster.monsterType,
          monster.environment,
          monster.tags,
          monster.specialDrops,
          monster.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(monsterQuery);
      })
    : campaign.monsters;

  const partySummaries = campaign.characters.map((character) => ({
    ...character,
    bankSnapshot: deriveHoldings(character.ledgerEntries, HoldingScope.BANK),
  }));

  return {
    campaigns,
    campaign,
    activeNpcs: campaign.npcs.filter((npc) => npc.type === NpcType.STANDARD),
    companions: campaign.npcs.filter((npc) => npc.type === NpcType.COMPANION),
    filteredMonsters,
    partySummaries,
    lootPools: campaign.lootPools,
    quests: campaign.quests,
    storefronts: campaign.storefronts,
    mailThreads: campaign.mailThreads,
    craftingRecipes: campaign.craftingRecipes,
    craftingJobs: campaign.craftingJobs,
  };
}

export async function getCompendiumSummary(campaignId: string) {
  const [monsterCount, magicItemCount] = await Promise.all([
    prisma.monsterCompendiumEntry.count({
      where: {
        campaignId,
        compendiumSource: {
          not: null,
        },
      },
    }),
    prisma.lootItem.count({
      where: {
        campaignId,
        compendiumSource: {
          not: null,
        },
      },
    }),
  ]);

  return {
    monsterCount,
    magicItemCount,
  };
}

export async function getPlayerAccountBySession(input: {
  campaignId: string;
  characterId: string;
}) {
  const character = await prisma.character.findFirst({
    where: {
      id: input.characterId,
      campaignId: input.campaignId,
      campaign: {
        status: CampaignStatus.ACTIVE,
      },
    },
    include: {
      campaign: {
        include: {
          quests: {
            where: {
              status: {
                in: ["OPEN", "ACTIVE"],
              },
            },
            include: {
              assignee: true,
            },
            orderBy: {
              updatedAt: "desc",
            },
          },
          storefronts: {
            where: {
              status: "ACTIVE",
            },
            include: {
              offers: {
                orderBy: {
                  updatedAt: "desc",
                },
                take: 8,
              },
            },
            orderBy: {
              updatedAt: "desc",
            },
          },
          mailThreads: {
            where: {
              status: "ACTIVE",
            },
            include: {
              messages: {
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: 10,
          },
          craftingJobs: {
            where: {
              OR: [
                {
                  characterId: input.characterId,
                },
                {
                  characterId: null,
                },
              ],
            },
            include: {
              recipe: true,
              lootItem: true,
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: 10,
          },
          lootPools: {
            include: {
              encounter: {
                select: {
                  id: true,
                  title: true,
                  difficulty: true,
                  partyLevel: true,
                },
              },
              items: {
                include: {
                  lootItem: true,
                  awardedCharacter: true,
                  rollEntries: {
                    include: {
                      character: true,
                    },
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: 10,
          },
        },
      },
      ledgerEntries: {
        include: {
          lootItem: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!character) {
    return null;
  }

  return {
    ...character,
    bankSnapshot: deriveHoldings(character.ledgerEntries, HoldingScope.BANK),
    inventorySnapshot: deriveHoldings(character.ledgerEntries, HoldingScope.INVENTORY),
    lootPools: character.campaign.lootPools,
    visibleMailThreads: character.campaign.mailThreads.filter((thread) =>
      isMailThreadVisibleToCharacter(thread, character),
    ),
  };
}

export async function authenticateBankAccess(input: {
  campaignId: string;
  characterName: string;
}) {
  return prisma.character.findFirst({
    where: {
      campaignId: input.campaignId,
      campaign: {
        status: CampaignStatus.ACTIVE,
      },
      name: {
        equals: input.characterName.trim(),
      },
    },
    include: {
      bankAccess: true,
      campaign: true,
    },
  });
}

export function deriveHoldings(
  entries: Array<{
    scope: HoldingScope;
    goldDelta: number;
    quantity: number;
    lootItem: { id: string; name: string; rarity: string; kind: string } | null;
  }>,
  scope: HoldingScope,
) {
  const gold = entries
    .filter((entry) => entry.scope === scope)
    .reduce((sum, entry) => sum + entry.goldDelta, 0);

  const itemMap = new Map<
    string,
    { id: string; name: string; rarity: string; kind: string; quantity: number }
  >();

  for (const entry of entries) {
    if (entry.scope !== scope || !entry.lootItem || entry.quantity === 0) {
      continue;
    }

    const current = itemMap.get(entry.lootItem.id) ?? {
      id: entry.lootItem.id,
      name: entry.lootItem.name,
      rarity: entry.lootItem.rarity,
      kind: entry.lootItem.kind,
      quantity: 0,
    };

    current.quantity += entry.quantity;

    if (current.quantity > 0) {
      itemMap.set(entry.lootItem.id, current);
    } else {
      itemMap.delete(entry.lootItem.id);
    }
  }

  return {
    gold,
    items: Array.from(itemMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

export function parseTagInput(value: FormDataEntryValue | null) {
  return splitTags(String(value ?? ""))
    .slice(0, 8)
    .join(", ");
}

export function isMailThreadVisibleToCharacter(
  thread: {
    recipientName: string;
    senderName: string;
  },
  character: {
    name: string;
    playerName: string;
  },
) {
  const nameKey = character.name.toLowerCase();
  const playerKey = character.playerName.toLowerCase();
  const recipient = thread.recipientName.toLowerCase();
  const sender = thread.senderName.toLowerCase();

  return (
    recipient.includes("party") ||
    recipient.includes(nameKey) ||
    recipient.includes(playerKey) ||
    sender.includes(nameKey) ||
    sender.includes(playerKey)
  );
}
