const SESSION_COOKIE = "whoize_session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function hashSession(sessionId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionId),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function getOrCreateSession(request: Request) {
  const current = readCookie(request, SESSION_COOKIE);
  const sessionId = current && current.length >= 32 ? current : randomToken();
  const secure = new URL(request.url).protocol === "https:";
  return {
    sessionHash: await hashSession(sessionId),
    setCookie: current
      ? null
      : `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`,
  };
}

export async function getSessionHash(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  return sessionId && sessionId.length >= 32
    ? hashSession(sessionId)
    : null;
}

export function createOpaqueToken(prefix: string) {
  return `${prefix}_${randomToken(24)}`;
}
