import type { Metadata } from "next";
import { CaptchaVersions } from "@/apps/captcha-versions/components/CaptchaVersions";

export const metadata: Metadata = {
  title: "CAPTCHA Versions",
  description:
    "A runnable comparison of WHOIZE client Canvas, server APNG, WebM, sparse-frame, and browser-blur CAPTCHA architectures.",
};

export default function VersionsPage() {
  return <CaptchaVersions />;
}
