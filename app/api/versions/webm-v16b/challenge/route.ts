import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import {
  createReadableRegenerativeChallenge,
  readableRegenerativePublicChallenge,
} from "@/apps/captcha-versions/server/regenerative-motion-service";
import { getOrCreateSession } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const [{ config }, session] = await Promise.all([
      readServerCaptchaConfig(),
      getOrCreateSession(request),
    ]);
    const { record } = await createReadableRegenerativeChallenge({
      config,
      sessionHash: session.sessionHash,
    });
    const headers = new Headers({
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    });
    if (session.setCookie) headers.set("set-cookie", session.setCookie);
    return Response.json(readableRegenerativePublicChallenge(record), {
      status: 201,
      headers,
    });
  } catch (error) {
    console.error("Unable to create v1.6b readable challenge", error);
    return Response.json(
      { error: "Readable regenerative challenge is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
