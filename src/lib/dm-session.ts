import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "campaign-vault-dm";

type SessionPayload = {
  role: "dm";
  username: string;
};

function getSecret() {
  return (
    process.env.DM_SESSION_SECRET ??
    process.env.PLAYER_SESSION_SECRET ??
    "campaign-vault-local-dm-secret"
  );
}

function getConfiguredUsername() {
  return process.env.DM_USERNAME ?? "dm";
}

function getConfiguredAccessCode() {
  return process.env.DM_ACCESS_CODE ?? "campaign-vault-admin";
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

function encodeSession(payload: SessionPayload) {
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function decodeSession(rawValue: string | undefined): SessionPayload | null {
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
    return JSON.parse(fromBase64Url(encoded)) as SessionPayload;
  } catch {
    return null;
  }
}

export function isValidDmCredential(input: { username: string; accessCode: string }) {
  return (
    input.username.trim() === getConfiguredUsername() &&
    input.accessCode === getConfiguredAccessCode()
  );
}

export async function getDmSession() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireDmSession() {
  const session = await getDmSession();

  if (!session) {
    redirect("/dm/login");
  }

  return session;
}

export async function setDmSession(payload: SessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearDmSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function getDmLoginHint() {
  return {
    username: getConfiguredUsername(),
    usingFallbackCode: !process.env.DM_ACCESS_CODE,
  };
}
