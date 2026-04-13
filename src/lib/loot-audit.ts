type LootAuditEntry = {
  id: string;
  createdAt: Date;
  scope: string;
  entryType: string;
  quantity: number;
  goldDelta: number;
  note: string;
  lootItem: { name: string } | null;
  character?: { name: string } | null;
};

export function getRecentLootAwardEntries<T extends LootAuditEntry>(entries: T[]) {
  return entries.filter((entry) => entry.entryType === "AWARD");
}

export function formatLootAuditHeadline(entry: LootAuditEntry) {
  if (entry.lootItem) {
    return `${entry.lootItem.name} × ${entry.quantity}`;
  }

  return entry.goldDelta !== 0 ? "Gold award" : "Loot award";
}

export function formatLootAuditDetail(entry: LootAuditEntry) {
  const parts = [];

  if (entry.character?.name) {
    parts.push(entry.character.name);
  }

  parts.push(entry.scope === "BANK" ? "Bank" : entry.scope === "INVENTORY" ? "Inventory" : entry.scope);

  return parts.join(" · ");
}

export function formatLootAuditDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
