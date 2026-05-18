import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FPCTalk",
  description: "Francis Parker Collegiate 학원 메신저",
  applicationName: "FPCTalk",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FPCTalk",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180.png?v=2", sizes: "180x180" },
      { url: "/icons/apple-touch-icon-167.png?v=2", sizes: "167x167" },
      { url: "/icons/apple-touch-icon-152.png?v=2", sizes: "152x152" },
      { url: "/icons/apple-touch-icon-120.png?v=2", sizes: "120x120" },
    ],
  },
};

export const viewport: import("next").Viewport = {
  themeColor: "#0F4D3A",
  initialScale: 1,
  width: "device-width",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* iOS Safari는 link 태그를 head에서 직접 찾음.
            Next.js Metadata API와 별도로 명시 — 일부 iOS 버전에서 fallback 보장. */}
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icons/apple-touch-icon-180.png?v=2"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/icons/apple-touch-icon-167.png?v=2"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/icons/apple-touch-icon-152.png?v=2"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/icons/apple-touch-icon-120.png?v=2"
        />
        <link
          rel="apple-touch-icon-precomposed"
          href="/icons/apple-touch-icon-180.png?v=2"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="FPCTalk" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2976423366068371"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
