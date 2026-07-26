import type { Metadata } from "next";
import { CaptchaLab } from "@/apps/demo/components/CaptchaLab";

export const metadata: Metadata = {
  title: "Motion Lab",
  description:
    "A laboratory for motion-defined CAPTCHA density, coherence, speed, and frame rate.",
};

export default function LabPage() {
  return <CaptchaLab />;
}
