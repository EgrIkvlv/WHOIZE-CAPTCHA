import type { Metadata } from "next";
import { CaptchaDemo } from "@/apps/demo/components/CaptchaDemo";

export const metadata: Metadata = {
  title: "Motion CAPTCHA",
  description:
    "An interactive CAPTCHA in which a hidden figure emerges only through motion.",
};

export default function Home() {
  return <CaptchaDemo />;
}
