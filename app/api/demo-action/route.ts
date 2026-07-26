import { redeemProof } from "@/apps/server-captcha/server/challenge-service";
import { getSessionHash } from "@/apps/server-captcha/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionHash = await getSessionHash(request);
  if (!sessionHash) {
    return Response.json(
      { success: false, error: "Verification session is missing" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let body: { proofToken?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { success: false, error: "Invalid action payload" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  if (
    typeof body.proofToken !== "string" ||
    typeof body.action !== "string"
  ) {
    return Response.json(
      { success: false, error: "Proof token and action are required" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const result = await redeemProof({
      token: body.proofToken,
      sessionHash,
      action: body.action,
    });
    if (!result.success) {
      const status =
        result.reason === "expired"
          ? 410
          : result.reason === "used"
            ? 409
            : result.reason === "session" || result.reason === "action"
              ? 403
              : 404;
      return Response.json(
        { success: false, error: result.reason },
        { status, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { success: true, message: "Protected demo action completed" },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Unable to redeem CAPTCHA proof", error);
    return Response.json(
      { success: false, error: "Protected action is unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
