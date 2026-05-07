import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Tennis Bootcamp — Where Athletes Evolve!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#061427",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "60px",
        }}
      >
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            color: "white",
            letterSpacing: "0.12em",
            textAlign: "center",
          }}
        >
          TENNIS BOOTCAMP
        </div>
        <div
          style={{
            fontSize: 34,
            color: "#B4E655",
            marginTop: 28,
            letterSpacing: "0.04em",
          }}
        >
          Where Athletes Evolve!
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.55)",
            marginTop: 20,
            letterSpacing: "0.08em",
          }}
        >
          ELITE COACHING · TORONTO
        </div>
      </div>
    ),
    { ...size }
  );
}
