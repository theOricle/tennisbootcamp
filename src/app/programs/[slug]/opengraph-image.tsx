import { ImageResponse } from "next/og";
import { programs } from "@/content/programs";
import { buildOgImage } from "@/lib/og-image";
import { ogFonts } from "@/lib/og-fonts";
import { plateSvgString } from "@/lib/plates/geometry";
import { plateSpec } from "@/lib/plates/specs";

// One card per listed program, built ahead (audit L25), not on the edge.
export const alt = "Tennis Bootcamp Program";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The plate strip at the bottom of the card. */
const PLATE_WIDTH = 1200;
const PLATE_HEIGHT = 380;

export function generateStaticParams() {
  return programs.filter((p) => !p.unlisted).map((p) => ({ slug: p.slug }));
}

/**
 * The program's Court Plate (audit H1) as a data URI for Satori: the strip
 * frame at `fixed` density, so stroke widths are in viewBox units (Satori
 * and resvg ignore vector-effect). Any failure falls back to the text card.
 */
function plateDataUri(plateId: string, comingSoon: boolean): string | undefined {
  try {
    const svg = plateSvgString(plateSpec(plateId), "strip", {
      density: "fixed",
      renderWidth: PLATE_WIDTH,
      width: PLATE_WIDTH,
      height: PLATE_HEIGHT,
      comingSoon,
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch (err) {
    console.error("program OG plate failed, using the text card:", err);
    return undefined;
  }
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  const title = program?.title ?? "Program";
  const plate = program ? plateDataUri(program.plate, !!program.comingSoon) : undefined;
  return new ImageResponse(
    buildOgImage(title, "Tennis Bootcamp · Toronto", plate),
    { ...size, fonts: await ogFonts() }
  );
}
