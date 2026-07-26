import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WHOIZE — Motion CAPTCHA Lab",
    template: "%s · WHOIZE",
  },
  description:
    "Экспериментальная CAPTCHA: объект невозможно увидеть в одном кадре, но можно распознать по движению.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
