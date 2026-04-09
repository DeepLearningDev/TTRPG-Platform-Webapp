const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function normalizeCharacterNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function calculateLockoutUntil(failedAttempts: number, now = new Date()) {
  if (failedAttempts < MAX_FAILED_ATTEMPTS) {
    return null;
  }

  return new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
}

export function isLockedOut(lockedUntil: Date | null | undefined, now = new Date()) {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function getRemainingLockMinutes(lockedUntil: Date | null | undefined, now = new Date()) {
  if (!lockedUntil) {
    return 0;
  }

  return Math.max(0, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
}
