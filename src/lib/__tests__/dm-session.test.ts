import { describe, expect, it } from "vitest";
import { getDmLoginHint, isValidDmCredential } from "@/lib/dm-session";

describe("dm-session", () => {
  it("accepts the configured fallback credential when no env override is present", () => {
    const loginHint = getDmLoginHint();

    expect(loginHint.username).toBe("dm");
    expect(isValidDmCredential({ username: "dm", accessCode: "campaign-vault-admin" })).toBe(
      true,
    );
  });

  it("rejects invalid credentials", () => {
    expect(isValidDmCredential({ username: "dm", accessCode: "wrong" })).toBe(false);
  });
});
