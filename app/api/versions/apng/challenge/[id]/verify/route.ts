import { verifyLegacyApngChallenge } from "@/apps/captcha-versions/server/legacy-apng-service";
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
    const result = await verifyLegacyApngChallenge({
      id,
      sessionHash,
      x: Number(body.x),
      y: Number(body.y),
      frameIndex: Number(body.frameIndex),
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
    console.error("Unable to verify legacy APNG challenge", error);
    return Response.json(
      { success: false, reason: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
