import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSession,
  verifyAdminPassword,
} from "@/apps/control-plane/server/admin-auth";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  if (
    !payload?.password ||
    !(await verifyAdminPassword(payload.password.slice(0, 256)))
  ) {
    return Response.json(
      { error: "Неверный пароль владельца" },
      { status: 401 },
    );
  }

  const session = await createAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_COOKIE,
    session.value,
    adminCookieOptions(session.maxAge),
  );
  return response;
}
