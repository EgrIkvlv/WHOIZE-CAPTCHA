import type { Metadata } from "next";
import { AdminPanel } from "../AdminPanel";

export const metadata: Metadata = {
  title: "Control Plane",
  description:
    "Локальная административная панель для настройки поведения WHOIZE CAPTCHA.",
};

export default function AdminPage() {
  return <AdminPanel />;
}
