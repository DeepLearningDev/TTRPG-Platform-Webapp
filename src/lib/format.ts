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
