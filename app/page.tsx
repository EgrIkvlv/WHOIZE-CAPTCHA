import type { Metadata } from "next";
import { CaptchaLab } from "./CaptchaLab";

export const metadata: Metadata = {
  title: "WHOIZE — Motion CAPTCHA Lab",
  description:
    "Первый прототип CAPTCHA, в которой фигура существует только во времени.",
};

export default function Home() {
  return <CaptchaLab />;
}
