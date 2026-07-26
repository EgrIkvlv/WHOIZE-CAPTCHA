import { cookies } from "next/headers";

export const ADMIN_COOKIE = "whoize_control_plane";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function password() {
  return process.env.CONTROL_PLANE_PASSWORD ?? "";
}

function sessionSecret() {
  return process.env.CONTROL_PLANE_SESSION_SECRET ?? "";
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function digest(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function safeEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([digest(left), digest(right)]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

export async function verifyAdminPassword(candidate: string) {
  const configured = password();
  if (!configured || !sessionSecret()) return false;
  return safeEqual(candidate, configured);
}

export async function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expiresAt);
  return {
    value: `${payload}.${await sign(payload)}`,
    maxAge: SESSION_SECONDS,
  };
}

export async function verifyAdminSession(value: string | undefined) {
  if (!value || !sessionSecret()) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature || Number(expiresAt) <= Date.now() / 1000) {
    return false;
  }
  return safeEqual(signature, await sign(expiresAt));
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
