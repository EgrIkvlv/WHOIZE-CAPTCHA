import type { Metadata } from "next";
import { CaptchaLab } from "@/apps/demo/components/CaptchaLab";

export const metadata: Metadata = {
  title: "Motion Lab",
  description:
    "Лаборатория параметров motion-defined CAPTCHA: плотность, связность, скорость и частота.",
};

export default function LabPage() {
  return <CaptchaLab />;
}
