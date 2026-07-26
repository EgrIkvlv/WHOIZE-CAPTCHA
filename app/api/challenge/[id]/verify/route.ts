import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import { verifyServerChallenge } from "@/apps/server-captcha/server/challenge-service";
import { getSessionHash } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionHash = await getSessionHash(request);
  if (!sessionHash) {
    return Response.json(
      { success: false, error: "Challenge session is missing" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let body: { x?: unknown; y?: unknown; frameIndex?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { success: false, error: "Invalid verification payload" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const [{ id }, { config }] = await Promise.all([
      context.params,
      readServerCaptchaConfig(),
    ]);
    const result = await verifyServerChallenge({
      id,
      sessionHash,
      x: Number(body.x),
      y: Number(body.y),
      frameIndex: Number(body.frameIndex),
      proofTtlSeconds: config.proofTtlSeconds,
    });
    const status =
      result.success || result.reason === "miss"
        ? 200
        : result.reason === "expired"
          ? 410
          : result.reason === "used" || result.reason === "locked"
            ? 409
            : result.reason === "session"
              ? 403
              : result.reason === "invalid"
                ? 400
                : 404;
    return Response.json(result, {
      status,
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Unable to verify CAPTCHA challenge", error);
    return Response.json(
      { success: false, error: "Verification service is unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
