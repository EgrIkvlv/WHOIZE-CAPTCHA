import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions } from "../../../server/admin-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, "", adminCookieOptions(0));
  return response;
}
