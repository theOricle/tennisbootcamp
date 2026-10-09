import { brandMarkDataUrl } from "@/lib/brandMark";

/**
 * Shared layout for all per-page OG cards (audit L25): the brand mark and
 * wordmark, the page title in Geist (when ogFonts() loaded it) and a short
 * subtitle in a solid grey at 4.5:1 or better. Returns the JSX passed to
 * ImageResponse.
 */
export function buildOgImage(title: string, subtitle = "Elite Coaching · Toronto") {
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
      <div style={{ display: "flex", alignItems: "center", padding: "56px 80px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
        <img src={brandMarkDataUrl()} width={64} height={64} alt="" />
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

      {/* Content — pushed to bottom */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 80px 64px",
        }}
      >
        <div
          style={{
            fontSize: 72,
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
            fontSize: 28,
            fontWeight: 600,
            color: "#A7B0BC",
            marginTop: 24,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}
