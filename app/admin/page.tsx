import type { Metadata } from "next";
import { AdminLogin } from "../AdminLogin";
import { AdminPanel } from "../AdminPanel";
import { isAdminAuthenticated } from "../server/admin-auth";
import { readServerCaptchaConfig } from "../server/captcha-config-store";

export const metadata: Metadata = {
  title: "Control Plane",
  description:
    "Локальная административная панель для настройки поведения WHOIZE CAPTCHA.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />;
  const snapshot = await readServerCaptchaConfig();
  return (
    <AdminPanel
      initialConfig={snapshot.config}
      initialUpdatedAt={snapshot.updatedAt}
      storage={snapshot.storage}
    />
  );
}
