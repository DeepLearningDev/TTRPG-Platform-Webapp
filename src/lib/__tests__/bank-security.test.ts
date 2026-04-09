import { describe, expect, it } from "vitest";
import {
  calculateLockoutUntil,
  getRemainingLockMinutes,
  isLockedOut,
  normalizeCharacterNameKey,
} from "@/lib/bank-security";

describe("bank-security", () => {
  it("does not lock accounts before the threshold", () => {
    expect(calculateLockoutUntil(4, new Date("2026-04-09T12:00:00Z"))).toBeNull();
  });

  it("locks accounts at the threshold for 15 minutes", () => {
    const now = new Date("2026-04-09T12:00:00Z");
    const lockedUntil = calculateLockoutUntil(5, now);

    expect(lockedUntil?.toISOString()).toBe("2026-04-09T12:15:00.000Z");
    expect(isLockedOut(lockedUntil, now)).toBe(true);
    expect(getRemainingLockMinutes(lockedUntil, now)).toBe(15);
  });

  it("reports zero remaining minutes after lockout expires", () => {
    const now = new Date("2026-04-09T12:20:00Z");
    const lockedUntil = new Date("2026-04-09T12:15:00Z");

    expect(isLockedOut(lockedUntil, now)).toBe(false);
    expect(getRemainingLockMinutes(lockedUntil, now)).toBe(0);
  });

  it("normalizes character names for throttle keys", () => {
    expect(normalizeCharacterNameKey("  Miri   Vale  ")).toBe("miri vale");
  });
});
