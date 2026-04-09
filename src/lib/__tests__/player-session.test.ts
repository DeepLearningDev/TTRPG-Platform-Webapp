import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { decodePlayerSession, encodePlayerSession } from "@/lib/player-session";

describe("player-session", () => {
  it("round-trips through the signed cookie format", () => {
    const encoded = encodePlayerSession({
      campaignId: "campaign-1",
      characterId: "character-1",
    });

    expect(decodePlayerSession(encoded)).toEqual({
      campaignId: "campaign-1",
      characterId: "character-1",
    });
  });

  it("rejects tampered signatures", () => {
    const encoded = encodePlayerSession({
      campaignId: "campaign-1",
      characterId: "character-1",
    });
    const [payload] = encoded.split(".");

    expect(decodePlayerSession(`${payload}.invalid-signature`)).toBeNull();
  });

  it("rejects signed payloads that do not match the expected session shape", () => {
    const payload = Buffer.from(JSON.stringify({ campaignId: "campaign-1" }), "utf8").toString(
      "base64url",
    );
    const signature = createHmac("sha256", "campaign-vault-local-secret")
      .update(payload)
      .digest("base64url");

    expect(decodePlayerSession(`${payload}.${signature}`)).toBeNull();
  });
});
