import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import {
  SPARSE_LOOP_SECONDS,
  SPARSE_MIME_TYPE,
} from "@/apps/captcha-versions/server/sparse-frames-engine";
import { createSparseFramesChallenge } from "@/apps/captcha-versions/server/sparse-frames-service";
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
    const { record, payload } = await createSparseFramesChallenge({
      config,
      sessionHash: session.sessionHash,
    });
    const { scene } = record;
    const headers = new Headers({
      "content-type": SPARSE_MIME_TYPE,
      "content-length": String(payload.byteLength),
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-whoize-challenge": record.id,
      "x-whoize-shape": SHAPE_SLUG[scene.shape],
      "x-whoize-width": String(scene.width),
      "x-whoize-height": String(scene.height),
      "x-whoize-fps": String(scene.fps),
      "x-whoize-frame-count": String(scene.frameCount),
      "x-whoize-density": String(scene.density),
      "x-whoize-dot-size": String(scene.dotSize),
      "x-whoize-loop-ms": String(SPARSE_LOOP_SECONDS * 1000),
      "x-whoize-expires-at": String(record.expiresAt),
      "x-whoize-max-attempts": String(record.maxAttempts),
      "x-whoize-payload-bytes": String(payload.byteLength),
    });
    if (session.setCookie) headers.set("set-cookie", session.setCookie);
    return new Response(payload.buffer, { status: 201, headers });
  } catch (error) {
    console.error("Unable to create sparse frame challenge", error);
    return Response.json(
      { error: "Sparse frame challenge is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
