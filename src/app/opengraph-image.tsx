import { ImageResponse } from "next/og";
import { buildOgImage } from "@/lib/og-image";
import { ogFonts } from "@/lib/og-fonts";

// Prerendered at build time, not regenerated on the edge (audit L25).
export const alt = "Tennis Bootcamp — Where Athletes Evolve!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    buildOgImage("Where Athletes Evolve!", "tennisbootcamp.ca · Toronto"),
    { ...size, fonts: await ogFonts() }
  );
}
