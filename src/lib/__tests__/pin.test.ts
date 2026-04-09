import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/pin";

describe("pin hashing", () => {
  it("verifies the original pin", () => {
    const hash = hashPin("2413", "campaign-vault-salt");

    expect(verifyPin("2413", hash)).toBe(true);
  });

  it("rejects the wrong pin", () => {
    const hash = hashPin("4821", "campaign-vault-salt");

    expect(verifyPin("9999", hash)).toBe(false);
  });

  it("rejects malformed hashes", () => {
    expect(verifyPin("4821", "bad-hash")).toBe(false);
  });
});
