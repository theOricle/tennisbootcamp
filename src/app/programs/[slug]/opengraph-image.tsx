import { ImageResponse } from "next/og";
import { programs } from "@/content/programs";
import { buildOgImage } from "@/lib/og-image";

export const runtime = "edge";
export const alt = "Tennis Bootcamp Program";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  const title = program?.title ?? "Program";
  return new ImageResponse(
    buildOgImage(title, "Tennis Bootcamp · Toronto"),
    { ...size }
  );
}
