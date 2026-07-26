import type { Metadata } from "next";
import { CaptchaVersions } from "@/apps/captcha-versions/components/CaptchaVersions";

export const metadata: Metadata = {
  title: "CAPTCHA Versions",
  description:
    "A runnable comparison of WHOIZE client Canvas, server APNG, sparse-frame, browser-blur, and WebM-only CAPTCHA architectures.",
};

export default function VersionsPage() {
  return <CaptchaVersions />;
}
