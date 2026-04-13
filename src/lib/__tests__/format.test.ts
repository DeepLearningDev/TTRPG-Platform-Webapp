import { describe, expect, it } from "vitest";
import {
  formatCopperAsGold,
  formatDifficultyLabel,
  formatEnumLabel,
  formatHoldingScopeLabel,
  splitTags,
} from "@/lib/format";

describe("splitTags", () => {
  it("trims whitespace and drops empty entries", () => {
    expect(splitTags("  warded,  broker , , undercity  ")).toEqual([
      "warded",
      "broker",
      "undercity",
    ]);
  });
});

describe("formatCopperAsGold", () => {
  it("formats mixed denominations", () => {
    expect(formatCopperAsGold(1234)).toBe("12 gp 3 sp 4 cp");
  });

  it("formats zero values", () => {
    expect(formatCopperAsGold(0)).toBe("0 cp");
  });

  it("preserves negative values", () => {
    expect(formatCopperAsGold(-250)).toBe("-2 gp 5 sp");
  });
});

describe("enum formatting helpers", () => {
  it("formats difficulty labels", () => {
    expect(formatDifficultyLabel("DEADLY")).toBe("Deadly");
  });

  it("formats underscore enums", () => {
    expect(formatEnumLabel("VERY_RARE")).toBe("Very Rare");
  });

  it("formats holding scopes for user-facing copy", () => {
    expect(formatHoldingScopeLabel("BANK")).toBe("Bank");
    expect(formatHoldingScopeLabel("INVENTORY")).toBe("Inventory");
  });
});
