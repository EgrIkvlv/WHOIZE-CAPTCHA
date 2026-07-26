import { readServerCaptchaConfig } from "../../server/captcha-config-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readServerCaptchaConfig();
    return Response.json(
      {
        config: snapshot.config,
        updatedAt: snapshot.updatedAt,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Серверный конфиг временно недоступен" },
      { status: 503 },
    );
  }
}
