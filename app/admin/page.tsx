import type { Metadata } from "next";
import { AdminLogin } from "@/apps/control-plane/components/AdminLogin";
import { AdminPanel } from "@/apps/control-plane/components/AdminPanel";
import { isAdminAuthenticated } from "@/apps/control-plane/server/admin-auth";
import { readServerCaptchaConfig } from "@/apps/control-plane/server/captcha-config-store";

export const metadata: Metadata = {
  title: "Control Plane",
  description:
    "Owner control plane for configuring WHOIZE CAPTCHA behavior.",
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
