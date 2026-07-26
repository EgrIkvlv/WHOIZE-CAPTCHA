import { WEBM_MIME_TYPE, renderChallengeSegment } from "@/apps/server-captcha/server/challenge-engine";
import { readServerChallengeSegment } from "@/apps/server-captcha/server/challenge-service";
import { getSessionHash } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; index: string }> },
) {
  const sessionHash = await getSessionHash(request);
  if (!sessionHash) {
    return Response.json(
      { error: "Challenge session is missing" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const { id, index } = await context.params;
    const result = await readServerChallengeSegment({
      id,
      sessionHash,
      segmentIndex: Number(index),
    });
    if (!result.success) {
      const status =
        result.reason === "expired"
          ? 410
          : result.reason === "used"
            ? 409
            : result.reason === "session"
              ? 403
              : result.reason === "invalid"
                ? 400
                : 404;
      return Response.json(
        { error: result.reason },
        { status, headers: { "cache-control": "no-store" } },
      );
    }

    const wasmResponse = await fetch(
      new URL("/codecs/webm-wasm.wasm", request.url),
      { cache: "force-cache" },
    );
    if (!wasmResponse.ok) {
      throw new Error(`WebM codec is unavailable (${wasmResponse.status})`);
    }
    const segment = await renderChallengeSegment({
      scene: result.record.scene,
      segmentIndex: Number(index),
      wasmBinary: await wasmResponse.arrayBuffer(),
    });
    return new Response(Uint8Array.from(segment).buffer, {
      status: 200,
      headers: {
        "content-type": WEBM_MIME_TYPE,
        "content-length": String(segment.byteLength),
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
        "x-whoize-segment": index,
      },
    });
  } catch (error) {
    console.error("Unable to render CAPTCHA video segment", error);
    return Response.json(
      { error: "Challenge video is temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
