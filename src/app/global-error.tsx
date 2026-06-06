"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#061427" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "white",
          }}
        >
          <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
            <p
              style={{
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                color: "#B4E655",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              Tennis Bootcamp
            </p>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "white",
                margin: "0 0 12px",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.6)",
                marginBottom: "32px",
              }}
            >
              We hit an unexpected error. Try again, or head back home.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={reset}
                style={{
                  background: "#B4E655",
                  color: "#061427",
                  border: "none",
                  borderRadius: "999px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "999px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Back to Home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
