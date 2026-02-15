import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-VEB2BV8FSN";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://glimmer.pages.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "拾光 Glimmer — AI 回憶影片服務 | AI Memorial Video Service",
    template: "%s | 拾光 Glimmer",
  },
  description:
    "上傳老照片或寵物照片，AI 自動生成電影級回憶影片。適用於追思、壽宴、婚禮、寵物紀念等場合。Upload photos of loved ones or pets, AI creates cinematic memorial videos.",
  keywords: [
    "AI影片", "回憶影片", "追思影片", "告別式影片", "壽宴影片", "婚禮影片",
    "寵物紀念影片", "寵物回憶", "毛孩影片", "pet memorial video",
    "AI memorial video", "photo to video", "AI video generator",
    "memorial service video", "funeral video", "birthday video",
    "拾光", "Glimmer",
  ],
  authors: [{ name: "拾光 Glimmer" }],
  creator: "拾光 Glimmer",
  icons: {
    icon: "/favicon.ico",
    apple: "/assets/glimmer-favicon.jpeg",
  },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    alternateLocale: "en_US",
    siteName: "拾光 Glimmer",
    title: "拾光 Glimmer — AI 回憶影片服務",
    description:
      "上傳老照片，AI 自動生成電影級回憶影片。追思、壽宴、婚禮等重要場合適用。",
    // Image auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "拾光 Glimmer — AI 回憶影片服務",
    description:
      "上傳老照片，AI 自動生成電影級回憶影片。Upload photos, AI creates cinematic memorial videos.",
    // Image auto-generated from twitter-image.tsx
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <head>
        {/* Google Analytics 4 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
