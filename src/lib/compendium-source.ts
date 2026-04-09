import {
  CompendiumSourceProvider,
  LootKind,
  LootRarity,
  MonsterSourceType,
} from "@prisma/client";

type JsonRecord = Record<string, unknown>;

const OPEN5E_BASE = "https://api.open5e.com";
const DND5E_BASE = "https://www.dnd5eapi.co/api/2014";
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 10;
const MAX_PAGES = 2;
const MAX_RESPONSE_BYTES = 750_000;

export type CompendiumImportSource = "OPEN5E" | "DND5E";
export type CompendiumImportKind = "monsters" | "magic-items";

export type ImportedMonster = {
  sourceKey: string;
  sourceUrl: string | null;
  sourceDocument: string | null;
  compendiumSource: CompendiumSourceProvider;
  name: string;
  challengeRating: string;
  monsterType: string;
  environment: string;
  tags: string;
  specialDrops: string;
  source: MonsterSourceType;
  isCustom: boolean;
  basedOnName: string | null;
  notes: string | null;
};

export type ImportedLootItem = {
  sourceKey: string;
  sourceUrl: string | null;
  sourceDocument: string | null;
  compendiumSource: CompendiumSourceProvider;
  name: string;
  rarity: LootRarity;
  kind: LootKind;
  description: string;
  sourceTag: string | null;
  goldValue: number | null;
};

export type ImportBudget = {
  pageSize: number;
  pageLimit: number;
};

export function clampImportBudget(input?: { pageSize?: number; pageLimit?: number }) {
  return {
    pageSize: clampNumber(input?.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    pageLimit: clampNumber(input?.pageLimit ?? 1, 1, MAX_PAGES),
  };
}

export function estimateGoldValue(rarity: LootRarity) {
  switch (rarity) {
    case LootRarity.COMMON:
      return 25;
    case LootRarity.UNCOMMON:
      return 100;
    case LootRarity.RARE:
      return 500;
    case LootRarity.VERY_RARE:
      return 2_500;
    case LootRarity.LEGENDARY:
      return 10_000;
  }
}

export async function importCompendiumBatch(input: {
  source: CompendiumImportSource;
  kind: CompendiumImportKind;
  budget?: ImportBudget;
}) {
  const budget = clampImportBudget(input.budget);

  if (input.kind === "monsters") {
    return importMonstersWithFallbacks(input.source, budget);
  }

  return importMagicItemsWithFallbacks(input.source, budget);
}

async function importMonstersWithFallbacks(source: CompendiumImportSource, budget: ImportBudget) {
  if (source === "OPEN5E") {
    try {
      const monsters = await importOpen5eMonsters(budget);

      if (monsters.length > 0) {
        return { monsters, lootItems: [] as ImportedLootItem[] };
      }
    } catch {
      // Fall through to the SRD fallback.
    }
  }

  return {
    monsters: await importDnd5eMonsters(budget),
    lootItems: [] as ImportedLootItem[],
  };
}

async function importMagicItemsWithFallbacks(source: CompendiumImportSource, budget: ImportBudget) {
  if (source === "OPEN5E") {
    try {
      const lootItems = await importOpen5eMagicItems(budget);

      if (lootItems.length > 0) {
        return { monsters: [] as ImportedMonster[], lootItems };
      }
    } catch {
      // Fall through to the SRD fallback.
    }
  }

  return {
    monsters: [] as ImportedMonster[],
    lootItems: await importDnd5eMagicItems(budget),
  };
}

async function importOpen5eMonsters(budget: ImportBudget) {
  const results: ImportedMonster[] = [];

  for (let page = 1; page <= budget.pageLimit; page += 1) {
    const data = await fetchOpen5eCollection("monsters", {
      fields: "name,key,slug,url,challenge_rating,type,environment,desc,document",
      page,
      limit: budget.pageSize,
    });

    for (const record of data.items) {
      results.push(normalizeOpen5eMonster(record));
    }

    if (data.items.length < budget.pageSize) {
      break;
    }
  }

  return results.slice(0, budget.pageSize * budget.pageLimit);
}

async function importOpen5eMagicItems(budget: ImportBudget) {
  const results: ImportedLootItem[] = [];

  for (let page = 1; page <= budget.pageLimit; page += 1) {
    const data = await fetchOpen5eCollection("magicitems", {
      fields: "name,key,slug,url,rarity,type,desc,document",
      page,
      limit: budget.pageSize,
    });

    for (const record of data.items) {
      results.push(normalizeOpen5eMagicItem(record));
    }

    if (data.items.length < budget.pageSize) {
      break;
    }
  }

  return results.slice(0, budget.pageSize * budget.pageLimit);
}

async function importDnd5eMonsters(budget: ImportBudget) {
  const response = await fetchJson(`${DND5E_BASE}/monsters`);
  const items = readCollection(response).slice(0, budget.pageSize * budget.pageLimit);
  const results: ImportedMonster[] = [];

  for (const item of items) {
    const detail = await fetchJson(`${DND5E_BASE}/monsters/${readString(item, "index")}`);
    results.push(normalizeDnd5eMonster(detail as JsonRecord));
  }

  return results;
}

async function importDnd5eMagicItems(budget: ImportBudget) {
  const response = await fetchJson(`${DND5E_BASE}/magic-items`);
  const items = readCollection(response).slice(0, budget.pageSize * budget.pageLimit);
  const results: ImportedLootItem[] = [];

  for (const item of items) {
    const detail = await fetchJson(`${DND5E_BASE}/magic-items/${readString(item, "index")}`);
    results.push(normalizeDnd5eMagicItem(detail as JsonRecord));
  }

  return results;
}

async function fetchOpen5eCollection(
  resource: "monsters" | "magicitems",
  options: { fields: string; page: number; limit: number },
) {
  const url = new URL(`${OPEN5E_BASE}/${resource}/`);
  url.searchParams.set("fields", options.fields);
  url.searchParams.set("page", String(options.page));
  url.searchParams.set("limit", String(clampNumber(options.limit, 1, MAX_PAGE_SIZE)));

  const response = await fetchJson(url.toString());
  return {
    items: readCollection(response),
  };
}

function normalizeOpen5eMonster(record: JsonRecord): ImportedMonster {
  const name = readString(record, "name");
  const sourceKey = readString(record, "key") || readString(record, "slug");
  const sourceDocument =
    readNestedString(record, "document", "key") ||
    readString(record, "document__slug") ||
    readString(record, "document_slug") ||
    null;
  const sourceUrl = readString(record, "url") || null;
  const challengeRating = readString(record, "challenge_rating") || "Unknown";
  const monsterType = readString(record, "type") || "Unknown";
  const environment = readString(record, "environment") || "Unknown";
  const notes = readString(record, "desc") || null;

  return {
    sourceKey: `open5e:${sourceKey || name.toLowerCase().replace(/\s+/g, "-")}`,
    sourceUrl,
    sourceDocument,
    compendiumSource: CompendiumSourceProvider.OPEN5E,
    name,
    challengeRating,
    monsterType,
    environment,
    tags: [monsterType, sourceDocument ?? "Open5e"].join(", "),
    specialDrops: "",
    source: MonsterSourceType.OPEN,
    isCustom: false,
    basedOnName: null,
    notes,
  };
}

function normalizeOpen5eMagicItem(record: JsonRecord): ImportedLootItem {
  const name = readString(record, "name");
  const sourceKey = readString(record, "key") || readString(record, "slug");
  const sourceDocument =
    readNestedString(record, "document", "key") ||
    readString(record, "document__slug") ||
    readString(record, "document_slug") ||
    null;
  const sourceUrl = readString(record, "url") || null;
  const rarity = normalizeRarity(readString(record, "rarity"));
  const kind = normalizeLootKind(readString(record, "type"));
  const description = readString(record, "desc") || "Open5e imported magic item.";

  return {
    sourceKey: `open5e:${sourceKey || name.toLowerCase().replace(/\s+/g, "-")}`,
    sourceUrl,
    sourceDocument,
    compendiumSource: CompendiumSourceProvider.OPEN5E,
    name,
    rarity,
    kind,
    description,
    sourceTag: sourceDocument ?? "Open5e",
    goldValue: estimateGoldValue(rarity),
  };
}

function normalizeDnd5eMonster(record: JsonRecord): ImportedMonster {
  const name = readString(record, "name");
  const sourceKey = readString(record, "index");
  const challengeRating =
    readNestedString(record, "challenge_rating", "name") ||
    readString(record, "challenge_rating") ||
    "Unknown";
  const monsterType = readString(record, "type") || "Unknown";
  const environment = readString(record, "environment") || readString(record, "size") || "SRD fallback";

  return {
    sourceKey: `dnd5e:${sourceKey || name.toLowerCase().replace(/\s+/g, "-")}`,
    sourceUrl: readString(record, "url") || null,
    sourceDocument: "dnd5eapi",
    compendiumSource: CompendiumSourceProvider.DND5EAPI,
    name,
    challengeRating,
    monsterType,
    environment,
    tags: [monsterType, "SRD"].join(", "),
    specialDrops: "",
    source: MonsterSourceType.SRD,
    isCustom: false,
    basedOnName: null,
    notes: readString(record, "desc") || null,
  };
}

function normalizeDnd5eMagicItem(record: JsonRecord): ImportedLootItem {
  const name = readString(record, "name");
  const sourceKey = readString(record, "index");
  const rarity = normalizeRarity(readNestedString(record, "rarity", "name") || readString(record, "rarity"));
  const kind = normalizeLootKind(
    readNestedString(record, "equipment_category", "name") ||
      readString(record, "type") ||
      readString(record, "category"),
  );
  const description = readString(record, "desc") || "D&D 5e SRD magic item.";

  return {
    sourceKey: `dnd5e:${sourceKey || name.toLowerCase().replace(/\s+/g, "-")}`,
    sourceUrl: readString(record, "url") || null,
    sourceDocument: "dnd5eapi",
    compendiumSource: CompendiumSourceProvider.DND5EAPI,
    name,
    rarity,
    kind,
    description,
    sourceTag: "D&D 5e SRD",
    goldValue: estimateGoldValue(rarity),
  };
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const parsedUrl = new URL(url);

    if (
      parsedUrl.protocol !== "https:" ||
      (parsedUrl.host !== "api.open5e.com" && parsedUrl.host !== "www.dnd5eapi.co")
    ) {
      throw new Error(`Blocked compendium host: ${parsedUrl.host}`);
    }

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");

    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("Compendium response exceeds the response-size guard");
    }

    const text = await response.text();

    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Compendium response body exceeds the response-size guard");
    }

    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function readCollection(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as JsonRecord;

  if (Array.isArray(record.results)) {
    return record.results.filter((entry): entry is JsonRecord => Boolean(entry));
  }

  if (Array.isArray(record.items)) {
    return record.items.filter((entry): entry is JsonRecord => Boolean(entry));
  }

  if (Array.isArray(record.data)) {
    return record.data.filter((entry): entry is JsonRecord => Boolean(entry));
  }

  return [];
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as JsonRecord;
  const entry = record[key];

  if (typeof entry === "string") {
    return entry.trim();
  }

  if (typeof entry === "number") {
    return String(entry);
  }

  if (Array.isArray(entry)) {
    return entry
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ");
  }

  return "";
}

function readNestedString(value: unknown, key: string, nestedKey: string) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as JsonRecord;
  const nested = record[key];

  if (!nested || typeof nested !== "object") {
    return "";
  }

  return readString(nested, nestedKey);
}

function normalizeRarity(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized in LootRarity) {
    return normalized as LootRarity;
  }

  return LootRarity.COMMON;
}

function normalizeLootKind(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized.includes("ARMOR")) {
    return LootKind.ARMOR;
  }

  if (normalized.includes("WEAPON")) {
    return LootKind.WEAPON;
  }

  if (normalized.includes("POTION") || normalized.includes("CONSUMABLE")) {
    return LootKind.CONSUMABLE;
  }

  if (normalized.includes("TOOL")) {
    return LootKind.TOOL;
  }

  if (normalized.includes("TREASURE") || normalized.includes("GEM")) {
    return LootKind.TREASURE;
  }

  return LootKind.WONDROUS;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
