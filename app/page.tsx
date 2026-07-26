import type { Metadata } from "next";
import { CaptchaDemo } from "./CaptchaDemo";

export const metadata: Metadata = {
  title: "Motion CAPTCHA",
  description:
    "Интерактивная CAPTCHA, в которой фигура проявляется только через движение.",
};

export default function Home() {
  return <CaptchaDemo />;
}
