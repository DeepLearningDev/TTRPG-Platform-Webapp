import {
  CraftingJobStatus,
  CraftingResolutionOutcome,
  HoldingScope,
  LootKind,
  LootRarity,
} from "@prisma/client";

export type CraftingMaterialRequirement = {
  key: string;
  name: string;
  quantity: number;
};

export type CraftingMaterialHolding = {
  lootItemId: string;
  key: string;
  name: string;
  quantity: number;
  scope: HoldingScope;
};

type CraftingLedgerEntry = {
  scope: HoldingScope;
  quantity: number;
  lootItem: {
    id: string;
    name: string;
  } | null;
};

type CraftingMaterialStatus = {
  key: string;
  name: string;
  required: number;
  available: number;
  isMet: boolean;
};

type ConsumptionMode = "full" | "failure";

type CraftingRecipeFields = {
  outputName: string;
  outputDescription: string;
  outputRarity: LootRarity;
  outputKind: LootKind;
  goldCost: number;
};

export type PlannedCraftingConsumptionEntry = CraftingMaterialHolding & {
  note: string;
};

export type PlannedCraftingGoldCostLedgerIntent = {
  scope: HoldingScope;
  goldDelta: number;
  note: string;
};

export type PlannedCraftingOutputItemIntent = {
  existingLootItemId: string | null;
  createLootItem:
    | {
        name: string;
        rarity: LootRarity;
        kind: LootKind;
        description: string;
        sourceTag: string;
      }
    | null;
  ledgerEntry: {
    scope: HoldingScope;
    quantity: number;
    note: string;
  };
};

export type PlannedCraftingJobPatch = {
  status: CraftingJobStatus;
  resolutionOutcome: CraftingResolutionOutcome;
  resolutionText: string;
  rollDie: number;
  rollTotal: number;
  resolvedAt: Date;
};

export type PlannedCraftingCompletion =
  | {
      isMet: false;
    }
  | {
      isMet: true;
      consumptionEntries: PlannedCraftingConsumptionEntry[];
      goldCostLedgerIntent: PlannedCraftingGoldCostLedgerIntent | null;
      outputItemIntent: PlannedCraftingOutputItemIntent | null;
      jobPatch: PlannedCraftingJobPatch;
      outcomeKey: string;
      outcomeText: string;
    };

export function normalizeCraftingMaterialKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/[^a-z0-9]+/g, " ");
}

function normalizeCraftingMaterialName(value: string) {
  return value
    .trim()
    .replace(/^and\s+/i, "")
    .replace(/[.]+$/g, "")
    .replace(/\s+/g, " ");
}

export function parseCraftingMaterials(value: string) {
  const segments = value
    .split(/[\n,;]+/)
    .map((segment) => normalizeCraftingMaterialName(segment))
    .filter(Boolean);

  return segments.reduce<CraftingMaterialRequirement[]>((requirements, segment) => {
    const match = segment.match(/^(\d+)\s*(?:x\s*)?(.+)$/i);
    const quantity = match ? Number.parseInt(match[1], 10) : 1;
    const rawName = match ? match[2] : segment;
    const name = normalizeCraftingMaterialName(rawName);
    const key = normalizeCraftingMaterialKey(name);

    if (!key) {
      return requirements;
    }

    const existing = requirements.find((requirement) => requirement.key === key);

    if (existing) {
      existing.quantity += quantity;
      return requirements;
    }

    requirements.push({
      key,
      name,
      quantity,
    });

    return requirements;
  }, []);
}

export function formatCraftingMaterials(requirements: CraftingMaterialRequirement[]) {
  if (requirements.length === 0) {
    return "No structured materials set.";
  }

  return requirements
    .map((requirement) => `${requirement.quantity}x ${requirement.name}`)
    .join(", ");
}

export function deriveCraftingHoldings(entries: CraftingLedgerEntry[]) {
  const holdingMap = new Map<string, CraftingMaterialHolding>();

  for (const entry of entries) {
    if (!entry.lootItem || entry.quantity === 0) {
      continue;
    }

    const key = normalizeCraftingMaterialKey(entry.lootItem.name);
    const mapKey = `${entry.scope}:${entry.lootItem.id}`;
    const current = holdingMap.get(mapKey) ?? {
      lootItemId: entry.lootItem.id,
      key,
      name: entry.lootItem.name,
      quantity: 0,
      scope: entry.scope,
    };

    current.quantity += entry.quantity;

    if (current.quantity > 0) {
      holdingMap.set(mapKey, current);
    } else {
      holdingMap.delete(mapKey);
    }
  }

  return Array.from(holdingMap.values()).sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === HoldingScope.INVENTORY ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function summarizeCraftingMaterials(
  requirements: CraftingMaterialRequirement[],
  holdings: CraftingMaterialHolding[],
) {
  const availableByKey = new Map<string, number>();

  for (const holding of holdings) {
    availableByKey.set(holding.key, (availableByKey.get(holding.key) ?? 0) + holding.quantity);
  }

  const materials = requirements.map<CraftingMaterialStatus>((requirement) => {
    const available = availableByKey.get(requirement.key) ?? 0;

    return {
      key: requirement.key,
      name: requirement.name,
      required: requirement.quantity,
      available,
      isMet: available >= requirement.quantity,
    };
  });

  return {
    materials,
    isMet: materials.every((material) => material.isMet),
    missing: materials
      .filter((material) => !material.isMet)
      .map((material) => `${material.name} (${material.available}/${material.required})`),
  };
}

export function buildCraftingConsumptionPlan(
  requirements: CraftingMaterialRequirement[],
  holdings: CraftingMaterialHolding[],
  mode: ConsumptionMode,
) {
  const consumption = new Map<string, CraftingMaterialHolding & { quantity: number }>();

  for (const requirement of requirements) {
    const remainingRequired =
      mode === "failure" ? Math.min(requirement.quantity, 1) : requirement.quantity;
    let remaining = remainingRequired;

    const candidates = holdings.filter((holding) => holding.key === requirement.key);

    for (const holding of candidates) {
      if (remaining <= 0) {
        break;
      }

      const quantity = Math.min(holding.quantity, remaining);
      remaining -= quantity;
      const mapKey = `${holding.scope}:${holding.lootItemId}`;
      const current = consumption.get(mapKey) ?? { ...holding, quantity: 0 };

      current.quantity += quantity;
      consumption.set(mapKey, current);
    }

    if (remaining > 0) {
      return {
        isMet: false,
        consumption: [],
      };
    }
  }

  return {
    isMet: true,
    consumption: Array.from(consumption.values()),
  };
}

function getCraftingDifficultyClass(rarity: LootRarity) {
  switch (rarity) {
    case LootRarity.COMMON:
      return 10;
    case LootRarity.UNCOMMON:
      return 12;
    case LootRarity.RARE:
      return 15;
    case LootRarity.VERY_RARE:
      return 18;
    case LootRarity.LEGENDARY:
      return 20;
    default:
      return 12;
  }
}

export function resolveCraftingOutcome(input: {
  level: number;
  rarity: LootRarity;
  outputName: string;
  dieRoll?: number;
}) {
  const dieRoll = input.dieRoll ?? Math.floor(Math.random() * 20) + 1;
  const skillBonus = Math.max(0, Math.floor(input.level / 4));
  const dc = getCraftingDifficultyClass(input.rarity);
  const total = dieRoll + skillBonus;

  if (total >= dc + 4) {
    return {
      outcome: CraftingResolutionOutcome.SUCCESS,
      dieRoll,
      skillBonus,
      dc,
      total,
      resolutionText: `${input.outputName} comes together cleanly. The full recipe is spent and the finished item is ready.`,
    };
  }

  if (total >= dc) {
    return {
      outcome: CraftingResolutionOutcome.MIXED,
      dieRoll,
      skillBonus,
      dc,
      total,
      resolutionText: `${input.outputName} is completed, but the work is rough around the edges. The full recipe is spent and the party gets a usable item with a complication note.`,
    };
  }

  return {
    outcome: CraftingResolutionOutcome.FAILURE,
    dieRoll,
    skillBonus,
    dc,
    total,
    resolutionText: `${input.outputName} collapses before the final bind holds. One staged unit of each required material is lost and no finished item is produced.`,
  };
}

export function planCraftingCompletion(input: {
  recipe: CraftingRecipeFields;
  characterLevel: number;
  requirements: CraftingMaterialRequirement[];
  holdings: CraftingMaterialHolding[];
  destinationScope: HoldingScope;
  dieRoll: number;
  existingLootItemId: string | null;
  resolvedAt: Date;
}): PlannedCraftingCompletion {
  const fullMaterialPlan = input.requirements.length
    ? buildCraftingConsumptionPlan(input.requirements, input.holdings, "full")
    : { isMet: true, consumption: [] };

  if (!fullMaterialPlan.isMet) {
    return {
      isMet: false,
    };
  }

  const resolution = resolveCraftingOutcome({
    level: input.characterLevel,
    rarity: input.recipe.outputRarity,
    outputName: input.recipe.outputName,
    dieRoll: input.dieRoll,
  });
  const outcomeKey = resolution.outcome.toLowerCase();
  const consumptionPlan = buildCraftingConsumptionPlan(
    input.requirements,
    input.holdings,
    resolution.outcome === CraftingResolutionOutcome.FAILURE ? "failure" : "full",
  );

  if (!consumptionPlan.isMet) {
    return {
      isMet: false,
    };
  }

  const outcomeText = `Roll ${resolution.dieRoll} + ${resolution.skillBonus} = ${resolution.total} vs DC ${resolution.dc}. ${resolution.resolutionText}`;
  const createsOutput = resolution.outcome !== CraftingResolutionOutcome.FAILURE;

  return {
    isMet: true,
    consumptionEntries: consumptionPlan.consumption.map((material) => ({
      ...material,
      note: `Spent ${material.quantity}x ${material.name} on ${input.recipe.outputName} (${outcomeKey} result)`,
    })),
    goldCostLedgerIntent:
      createsOutput && input.recipe.goldCost > 0
        ? {
            scope: HoldingScope.BANK,
            goldDelta: -input.recipe.goldCost,
            note: `Spent ${input.recipe.outputName} crafting costs (${outcomeKey} result)`,
          }
        : null,
    outputItemIntent: createsOutput
      ? {
          existingLootItemId: input.existingLootItemId,
          createLootItem: input.existingLootItemId
            ? null
            : {
                name: input.recipe.outputName,
                rarity: input.recipe.outputRarity,
                kind: input.recipe.outputKind,
                description: input.recipe.outputDescription,
                sourceTag: "Crafted item",
              },
          ledgerEntry: {
            scope: input.destinationScope,
            quantity: 1,
            note:
              resolution.outcome === CraftingResolutionOutcome.MIXED
                ? `Crafted ${input.recipe.outputName} with a mixed result`
                : `Crafted ${input.recipe.outputName}`,
          },
        }
      : null,
    jobPatch: {
      status: CraftingJobStatus.COMPLETE,
      resolutionOutcome: resolution.outcome,
      resolutionText: outcomeText,
      rollDie: resolution.dieRoll,
      rollTotal: resolution.total,
      resolvedAt: input.resolvedAt,
    },
    outcomeKey,
    outcomeText,
  };
}
