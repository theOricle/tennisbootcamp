import { ImageResponse } from "next/og";
import { TIERS } from "@/lib/tiers";
import { emblemSvgString } from "@/components/tiers/emblemGeometry";

// The tier emblems as PNGs for email (audit M35, design specs §3.9):
// /tier-emblem/{slug} — one per tier, 128px, prerendered at build time from
// the same shape data the site renders, so the emblem in an email is the
// emblem on the dashboard. Email clients get a PNG because most of them
// refuse inline SVG. Unknown slugs 404 (dynamicParams is off).

export const dynamic = "force-static";
export const dynamicParams = false;

/** Rendered size in px (design specs §3.2: 128 for the email PNG). */
const EMBLEM_PNG_SIZE = 128;

export function generateStaticParams() {
  return TIERS.map((t) => ({ slug: t.slug }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tier = TIERS.find((t) => t.slug === slug);
  if (!tier) return new Response("Not found", { status: 404 });

  // Satori rasterises an <img> whose src is an SVG data URI; every colour in
  // the emblem is an attribute, so nothing depends on CSS it cannot read.
  const svg = emblemSvgString(tier.id, { size: EMBLEM_PNG_SIZE });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: EMBLEM_PNG_SIZE,
          height: EMBLEM_PNG_SIZE,
          background: "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={EMBLEM_PNG_SIZE} height={EMBLEM_PNG_SIZE} alt="" />
      </div>
    ),
    {
      width: EMBLEM_PNG_SIZE,
      height: EMBLEM_PNG_SIZE,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    }
  );
}
