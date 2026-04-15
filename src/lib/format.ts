export function splitTags(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatCopperAsGold(value: number) {
  const isNegative = value < 0;
  const absolute = Math.abs(value);
  const gold = Math.floor(absolute / 100);
  const silver = Math.floor((absolute % 100) / 10);
  const copper = absolute % 10;

  const parts = [
    gold ? `${gold} gp` : null,
    silver ? `${silver} sp` : null,
    copper || (!gold && !silver) ? `${copper} cp` : null,
  ].filter(Boolean);

  return `${isNegative ? "-" : ""}${parts.join(" ")}`;
}

export function formatDifficultyLabel(value: string) {
  return value.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.replace(/^\w/, (letter) => letter.toUpperCase()))
    .join(" ");
}

export function formatHoldingScopeLabel(value: string) {
  return value === "BANK" ? "Bank" : value === "INVENTORY" ? "Inventory" : formatEnumLabel(value);
}

export function formatRelativeTime(from: Date, to: Date = new Date()) {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);

  if (diffWeeks < 5) {
    return `${diffWeeks}w ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths < 12) {
    return `${diffMonths}mo ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}
