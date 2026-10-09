// Geist for the OG cards (audit L25). next/og bundles a single regular face,
// so a bold title was a synthetic bold. The cards are prerendered at build
// time (no edge runtime), so the real 600 and 700 weights are fetched once,
// there, from Google Fonts. Any failure falls back to the bundled face: a
// card never fails to render over a font.

type OgFont = { name: string; data: ArrayBuffer; weight: 600 | 700; style: "normal" };

async function loadGoogleFont(family: string, weight: 600 | 700): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
    const css = await fetch(cssUrl, { signal: AbortSignal.timeout(5000) }).then((r) =>
      r.ok ? r.text() : ""
    );
    // satori reads TTF, OTF and WOFF, never WOFF2.
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"](?:truetype|opentype|woff)['"]\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

let cached: Promise<OgFont[]> | null = null;

/** Geist 600 and 700, whichever loaded; [] means the bundled face. */
export function ogFonts(): Promise<OgFont[]> {
  cached ??= Promise.all([loadGoogleFont("Geist", 600), loadGoogleFont("Geist", 700)]).then(
    ([semibold, bold]) => {
      const out: OgFont[] = [];
      if (semibold) out.push({ name: "Geist", data: semibold, weight: 600, style: "normal" });
      if (bold) out.push({ name: "Geist", data: bold, weight: 700, style: "normal" });
      return out;
    }
  );
  return cached;
}
