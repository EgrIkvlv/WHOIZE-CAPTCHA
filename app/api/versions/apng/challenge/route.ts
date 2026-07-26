import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import { createLegacyApngChallenge } from "@/apps/captcha-versions/server/legacy-apng-service";
import { getOrCreateSession } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

const SHAPE_SLUG = {
  Круг: "circle",
  Треугольник: "triangle",
  Ромб: "diamond",
  Звезда: "star",
} as const;

export async function POST(request: Request) {
  try {
    const [{ config }, session] = await Promise.all([
      readServerCaptchaConfig(),
      getOrCreateSession(request),
    ]);
    const { record, image } = await createLegacyApngChallenge({
      config,
      sessionHash: session.sessionHash,
    });
    const headers = new Headers({
      "content-type": "image/png",
      "content-length": String(image.byteLength),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-whoize-challenge": record.id,
      "x-whoize-shape": SHAPE_SLUG[record.shape],
      "x-whoize-width": String(record.width),
      "x-whoize-height": String(record.height),
      "x-whoize-fps": String(record.fps),
      "x-whoize-frame-count": String(record.positions.length),
      "x-whoize-expires-at": String(record.expiresAt),
      "x-whoize-max-attempts": String(record.maxAttempts),
      "x-whoize-effective-density": String(record.effectiveDensity),
      "x-whoize-effective-dot-size": String(record.effectiveDotSize),
      "x-whoize-payload-bytes": String(image.byteLength),
    });
    if (session.setCookie) headers.set("set-cookie", session.setCookie);
    return new Response(Uint8Array.from(image).buffer, {
      status: 201,
      headers,
    });
  } catch (error) {
    console.error("Unable to create legacy APNG challenge", error);
    return Response.json(
      { error: "Legacy APNG challenge is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
