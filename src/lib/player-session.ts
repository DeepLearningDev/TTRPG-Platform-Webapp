import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "campaign-vault-player";

type SessionPayload = {
  campaignId: string;
  characterId: string;
};

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.campaignId === "string" &&
    candidate.campaignId.length > 0 &&
    typeof candidate.characterId === "string" &&
    candidate.characterId.length > 0
  );
}

function getSecret() {
  return process.env.PLAYER_SESSION_SECRET ?? "campaign-vault-local-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function encodePlayerSession(payload: SessionPayload) {
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function decodePlayerSession(rawValue: string | undefined): SessionPayload | null {
  if (!rawValue) {
    return null;
  }

  const [encoded, providedSignature] = rawValue.split(".");

  if (!encoded || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encoded);

  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature),
    )
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as unknown;
    return isSessionPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getPlayerSession() {
  const cookieStore = await cookies();
  return decodePlayerSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function setPlayerSession(payload: SessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodePlayerSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearPlayerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
