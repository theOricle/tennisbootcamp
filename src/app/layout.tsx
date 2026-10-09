import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileQuizBar } from "@/components/layout/MobileQuizBar";
import { PreviewBanner } from "@/components/layout/PreviewBanner";
import { AnalyticsPageLocation } from "@/components/layout/AnalyticsPageLocation";
import { FirstTouchCapture } from "@/components/layout/FirstTouchCapture";
import { SITE_URL } from "@/lib/siteUrl";
import { SITE_DESCRIPTION } from "@/content/site";
import { gaInitScript } from "@/lib/analytics";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tennis Bootcamp",
    template: "%s | Tennis Bootcamp",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: "Tennis Bootcamp",
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-[200] focus-visible:rounded-lg focus-visible:bg-[#B4E655] focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-[#061427] focus-visible:outline-none"
        >
          Skip to content
        </a>
        <PreviewBanner />
        <FirstTouchCapture />
        <Navbar />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Footer />
        <MobileQuizBar />
      </body>
      {process.env.NEXT_PUBLIC_GA_ID && (
        <>
          {/* One script: trim, js, config — so no page, a 404 included, sends an invite token. */}
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: gaInitScript(process.env.NEXT_PUBLIC_GA_ID) }}
          />
          <Script
            id="ga-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
          />
          <AnalyticsPageLocation />
        </>
      )}
    </html>
  );
}
