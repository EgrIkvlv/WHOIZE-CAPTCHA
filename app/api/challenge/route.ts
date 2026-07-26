import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import { createServerChallenge } from "@/apps/server-captcha/server/challenge-service";
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
    const { record } = await createServerChallenge({
      config,
      sessionHash: session.sessionHash,
    });
    const { scene } = record;
    const headers = new Headers({
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    });
    if (session.setCookie) headers.set("set-cookie", session.setCookie);
    return Response.json(
      {
        id: record.id,
        shape: SHAPE_SLUG[scene.shape],
        width: scene.width,
        height: scene.height,
        fps: scene.fps,
        frameCount: scene.durationFrames,
        segmentDurationMs: (scene.segmentFrames / scene.fps) * 1000,
        segmentCount: Math.ceil(
          scene.durationFrames / scene.segmentFrames,
        ),
        expiresAt: record.expiresAt,
        maxAttempts: record.maxAttempts,
      },
      { status: 201, headers },
    );
  } catch (error) {
    console.error("Unable to create CAPTCHA challenge", error);
    return Response.json(
      { error: "Challenge service is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
