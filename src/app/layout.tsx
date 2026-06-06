import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

// Update metadataBase when tennisbootcamp.ca is live in Vercel
export const metadata: Metadata = {
  metadataBase: new URL("https://tennisbootcamp-seven.vercel.app"),
  title: {
    default: "Tennis Bootcamp",
    template: "%s | Tennis Bootcamp",
  },
  description:
    "Elite tennis coaching for competitive players in Toronto. Two locations — North York and Downtown. Limited spots — complete the intake to get priority placement.",
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
        <Navbar />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Footer />
      </body>
      {process.env.NEXT_PUBLIC_GA_ID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
      )}
    </html>
  );
}
