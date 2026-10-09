import { brandMarkDataUrl } from "@/lib/brandMark";

/**
 * Shared layout for all per-page OG cards (audit L25): the brand mark and
 * wordmark, the page title in Geist (when ogFonts() loaded it) and a short
 * subtitle in a solid grey at 4.5:1 or better. Returns the JSX passed to
 * ImageResponse.
 *
 * With `plate` (a 1200×380 SVG data URI, the program's Court Plate in its
 * strip frame; audit H1) the title sits in the top 250px and the plate fills
 * the bottom of the card. Satori draws the data URI as an image, so the SVG
 * must carry its own width and height and no vector-effect.
 */
export function buildOgImage(title: string, subtitle = "Elite Coaching · Toronto", plate?: string) {
  const compact = !!plate;
  return (
    <div
      style={{
        background: "#061427",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "0",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      {/* Top lime accent bar */}
      <div style={{ background: "#B4E655", height: "8px", width: "100%", flexShrink: 0 }} />

      {/* Brand row */}
      <div style={{ display: "flex", alignItems: "center", padding: compact ? "28px 80px 0" : "56px 80px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
        <img src={brandMarkDataUrl()} width={compact ? 44 : 64} height={compact ? 44 : 64} alt="" />
        <div
          style={{
            marginLeft: 20,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.24em",
            color: "#B4E655",
            textTransform: "uppercase",
          }}
        >
          Tennis Bootcamp
        </div>
      </div>

      {/* Content — pushed to the bottom of its block */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: compact ? "0 80px 28px" : "0 80px 64px",
        }}
      >
        <div
          style={{
            fontSize: compact ? 56 : 72,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: compact ? 24 : 28,
            fontWeight: 600,
            color: "#A7B0BC",
            marginTop: compact ? 12 : 24,
          }}
        >
          {subtitle}
        </div>
      </div>

      {plate && (
        <div style={{ display: "flex", width: "1200px", height: "380px", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
          <img src={plate} width={1200} height={380} alt="" />
        </div>
      )}
    </div>
  );
}
