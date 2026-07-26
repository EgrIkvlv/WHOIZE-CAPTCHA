import type { Metadata } from "next";
import { CaptchaVersions } from "@/apps/captcha-versions/components/CaptchaVersions";

export const metadata: Metadata = {
  title: "CAPTCHA Versions",
  description:
    "A live comparison of WHOIZE client canvas, server APNG, and server WebM CAPTCHA architectures.",
};

export default function VersionsPage() {
  return <CaptchaVersions />;
}
