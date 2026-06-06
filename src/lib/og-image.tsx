/** Shared layout for all per-page OG cards. Returns the JSX passed to ImageResponse. */
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
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top lime accent bar */}
      <div style={{ background: "#B4E655", height: "8px", width: "100%", flexShrink: 0 }} />

      {/* Content — pushed to bottom */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px 80px",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.28em",
            color: "#B4E655",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          TENNIS BOOTCAMP
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.5)",
            marginTop: 22,
            letterSpacing: "0.06em",
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}
