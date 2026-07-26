import type { Metadata } from "next";
import { headers } from "next/headers";
import { LanguageProvider } from "./i18n";
import "../packages/captcha-react/src/styles.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "WHOIZE CAPTCHA",
      template: "%s · WHOIZE",
    },
    description:
      "An experimental CAPTCHA: the object is invisible in a single frame and emerges only through motion.",
    openGraph: {
      title: "WHOIZE CAPTCHA",
      description: "A figure that exists only in time.",
      type: "website",
      url: origin,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1731,
          height: 909,
          alt: "WHOIZE CAPTCHA — A figure that exists only in time.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "WHOIZE CAPTCHA",
      description: "A figure that exists only in time.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
