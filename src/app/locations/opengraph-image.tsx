import { ImageResponse } from "next/og";
import { buildOgImage } from "@/lib/og-image";

export const runtime = "edge";
export const alt = "Locations | Tennis Bootcamp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(buildOgImage("Our Locations"), { ...size });
}
