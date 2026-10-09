// Horizontal-overflow check (audit H2, H8): no public page may scroll
// sideways at 320, 360, 390, 768, 1024 or 1440px (WCAG 1.4.10 reflow).
//
//   BASE_URL=http://localhost:3000 npm run check:overflow
//   BASE_URL=https://<vercel-preview> npm run check:overflow
//
// Needs a running site and a Chromium: Playwright's own build if installed,
// else the system Chrome or Edge (set PW_CHANNEL=chrome|msedge to choose).
// Not part of `npm test`, which runs without a server or a browser. Exits
// non-zero when any page overflows, naming the widest offending elements.

import { chromium, type Browser } from "playwright-core";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const WIDTHS = [320, 360, 390, 768, 1024, 1440];
const PATHS = process.env.PATHS?.split(",").map((p) => p.trim()).filter(Boolean) ?? [
  "/",
  "/programs",
  "/programs/youth-programs",
  "/programs/high-performance",
  "/programs/bootcamps",
  "/programs/kids-summer-camp",
  "/about",
  "/assessment",
  "/assessment/book",
  "/intake",
  "/login",
  "/legal/refund-policy",
  "/legal/waiver",
  "/legal/privacy",
  "/this-page-does-not-exist",
];

async function launch(): Promise<Browser> {
  const channel = process.env.PW_CHANNEL;
  const attempts = channel ? [{ channel }] : [{}, { channel: "chrome" }, { channel: "msedge" }];
  let lastError: unknown;
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`No Chromium found (tried Playwright's build, Chrome and Edge): ${String(lastError)}`);
}

async function main() {
  const browser = await launch();
  const failures: string[] = [];
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      for (const path of PATHS) {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
        const result = await page.evaluate(() => {
          const root = document.documentElement;
          const clientWidth = root.clientWidth;
          const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
            .map((el) => ({ el, right: el.getBoundingClientRect().right }))
            .filter(({ el, right }) => right > clientWidth + 0.5 && el.getClientRects().length > 0)
            .filter(({ el }) => {
              // Clipped by an ancestor with overflow hidden or clip: not a page overflow.
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const o = getComputedStyle(a).overflowX;
                if (o === "hidden" || o === "clip") return false;
              }
              return true;
            })
            .slice(0, 3)
            .map(({ el, right }) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")} right=${Math.round(right)}`);
          return { scrollWidth: root.scrollWidth, clientWidth, offenders };
        });
        const ok = result.scrollWidth <= result.clientWidth;
        console.log(`  ${ok ? "✓" : "✗"} ${width}px ${path}${ok ? "" : ` — scrollWidth ${result.scrollWidth} > ${result.clientWidth}: ${result.offenders.join("; ")}`}`);
        if (!ok) failures.push(`${width}px ${path}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} page(s) scroll sideways.`);
    process.exit(1);
  }
  console.log(`\nNo horizontal overflow on ${PATHS.length} pages at ${WIDTHS.join(", ")}px.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
