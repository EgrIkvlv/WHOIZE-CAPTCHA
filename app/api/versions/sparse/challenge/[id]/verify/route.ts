import { verifySparseFramesChallenge } from "@/apps/captcha-versions/server/sparse-frames-service";
import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";
import { getSessionHash } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionHash = await getSessionHash(request);
  if (!sessionHash) {
    return Response.json(
      { success: false, reason: "session" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  let body: { x?: unknown; y?: unknown; frameIndex?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { success: false, reason: "invalid" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const { id } = await context.params;
    const { config } = await readServerCaptchaConfig();
    const result = await verifySparseFramesChallenge({
      id,
      sessionHash,
      x: Number(body.x),
      y: Number(body.y),
      frameIndex: Number(body.frameIndex),
      proofTtlSeconds: config.proofTtlSeconds,
    });
    return Response.json(result, {
      status:
        result.success || result.reason === "miss"
          ? 200
          : result.reason === "expired"
            ? 410
            : result.reason === "session"
              ? 403
              : result.reason === "invalid"
                ? 400
                : result.reason === "not_found"
                  ? 404
                  : 409,
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Unable to verify sparse frame challenge", error);
    return Response.json(
      { success: false, reason: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
