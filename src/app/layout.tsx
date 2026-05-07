import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

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
    <html lang="en">
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}

