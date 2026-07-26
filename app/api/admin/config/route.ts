import { isAdminAuthenticated } from "@/apps/control-plane/server/admin-auth";
import {
  ConfigRevisionConflictError,
  readServerCaptchaConfig,
  writeServerCaptchaConfig,
} from "@/apps/control-plane/server/captcha-config-store";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Требуется вход владельца" }, { status: 401 });
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return unauthorized();
  const snapshot = await readServerCaptchaConfig();
  return Response.json(snapshot, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    const payload = (await request.json()) as {
      config?: unknown;
      expectedRevision?: unknown;
    };
    if (
      !payload.config ||
      !Number.isInteger(Number(payload.expectedRevision))
    ) {
      return Response.json(
        { error: "Некорректная конфигурация" },
        { status: 400 },
      );
    }

    const snapshot = await writeServerCaptchaConfig({
      value: payload.config,
      expectedRevision: Number(payload.expectedRevision),
      updatedBy: "owner",
    });
    return Response.json(snapshot, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof ConfigRevisionConflictError) {
      return Response.json(
        {
          error: error.message,
          config: error.current.config,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Не удалось опубликовать конфигурацию" },
      { status: 500 },
    );
  }
}
