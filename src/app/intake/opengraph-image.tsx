import { ImageResponse } from "next/og";
import { buildOgImage } from "@/lib/og-image";
import { ogFonts } from "@/lib/og-fonts";

// The quiz had no card of its own: its layout's openGraph dropped the site
// image (audit L25). Prerendered at build time.
export const alt = "The 2-minute quiz | Tennis Bootcamp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    buildOgImage("The 2-minute quiz", "A few questions · Sina places you by level and schedule"),
    { ...size, fonts: await ogFonts() }
  );
}
