// Run from project root: npx tsx src/scripts/test-platform-hygiene.ts
//
// Pins audit PR D (2026-10-09), the platform half: icons and theme colour
// (M38), cohort pages that refresh instead of freezing at build (M39), the
// Supabase SDK off the header's critical path (M40), titles, the server 404
// and the JSON-LD provider (M10), source-tagged funnel events (L13), the hero
// image (L24), prerendered OG cards with an /intake card (L25), security
// headers (L26) and one PostCSS config (L27). Source and config checks; the
// repo has no DOM test runner. Exits non-zero on any failure.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import nextConfig, { IMAGE_CACHE_TTL_SECONDS, SECURITY_HEADERS } from "../../next.config";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const exists = (path: string) => existsSync(join(ROOT, path));

async function main() {
  // ── M38: icons and theme colour ───────────────────────────────────────────
  console.log("Icons and theme colour (M38)");
  check("icon.svg exists", exists("src/app/icon.svg"));
  const icon = exists("src/app/icon.svg") ? read("src/app/icon.svg") : "";
  check("icon is the lime mark on navy", icon.includes("#061427") && icon.includes("#B4E655"));
  const apple = readFileSync(join(ROOT, "src/app/apple-icon.png"));
  check("apple-icon is a 180×180 PNG", apple.readUInt32BE(16) === 180 && apple.readUInt32BE(20) === 180);
  check("apple-icon has no alpha channel (navy, not transparent)", apple.readUInt8(25) === 2, `colour type ${apple.readUInt8(25)}`);
  const ico = readFileSync(join(ROOT, "src/app/favicon.ico"));
  const md5 = createHash("md5").update(ico).digest("hex");
  check("favicon is no longer the create-next-app file", !md5.startsWith("c30c7d42"), md5);
  check("favicon is an ICO with 16, 32 and 48px", ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3 && [0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i)).join() === "16,32,48");
  for (const svg of ["file", "globe", "next", "vercel", "window"]) {
    check(`starter public/${svg}.svg is gone`, !exists(`public/${svg}.svg`));
  }
  const layout = read("src/app/layout.tsx");
  check("viewport sets the navy theme colour", /export const viewport: Viewport = \{\s*themeColor: "#061427",\s*colorScheme: "dark",/.test(layout));

  // ── M39: cohort pages refresh ─────────────────────────────────────────────
  console.log("Cohort pages refresh (M39)");
  for (const page of ["src/app/page.tsx", "src/app/programs/page.tsx", "src/app/programs/[slug]/page.tsx"]) {
    check(`${page} revalidates every 60 seconds`, /export const revalidate = 60;/.test(read(page)));
  }
  const detail = read("src/app/programs/[slug]/page.tsx");
  check("program pages are no longer force-dynamic", !detail.includes("force-dynamic"));
  check("program pages are built ahead", detail.includes("export function generateStaticParams()"));
  const actions = read("src/lib/cohortActions.ts");
  check("admin cohort actions revalidate the pages", actions.includes('import { revalidateCohortPages } from "@/lib/cohortRevalidate"') && (actions.match(/revalidateCohortPages\(\);/g) ?? []).length >= 5);
  const reval = read("src/lib/cohortRevalidate.ts");
  check("revalidation covers home, /programs and every program page", reval.includes('["/", "/programs"]') && reval.includes('"/programs/[slug]"') && reval.includes('revalidatePath(COHORT_DETAIL_ROUTE, "page")'));
  check("revalidation never throws", reval.includes("} catch (err) {"));

  // ── M40: the SDK off the header's critical path ───────────────────────────
  console.log("Supabase SDK off the critical path (M40)");
  const STATIC_SDK = /^import[^\n]*from "@\/lib\/supabase\/browser";/m;
  for (const file of ["src/components/layout/Navbar.tsx", "src/components/layout/MobileQuizBar.tsx", "src/lib/useAuthState.ts"]) {
    check(`${file} has no static SDK import`, !STATIC_SDK.test(read(file)));
  }
  const auth = read("src/lib/useAuthState.ts");
  check("the SDK loads only for a visitor with a session cookie", auth.includes('import("@/lib/supabase/browser")') && auth.includes("if (!hasCookie) return;"));
  check("the header reads the cookie on the first client render", auth.includes("useSyncExternalStore(subscribe, cookieSnapshot, serverSnapshot)"));
  check("sign-out loads the SDK on demand", auth.includes("export async function signOut()"));
  check("gtag loads lazily", /id="ga-src"\s+strategy="lazyOnload"/.test(layout));

  // ── M10: titles, 404, JSON-LD provider ────────────────────────────────────
  console.log("Titles and 404 (M10)");
  const assessmentLayout = read("src/app/assessment/layout.tsx");
  check("/assessment keeps the site template for its children", /title: \{\s*default: "The Player Assessment",\s*template: "%s \| Tennis Bootcamp",/.test(assessmentLayout));
  check("/assessment/book has its own title", read("src/app/assessment/book/layout.tsx").includes('title: "Book Your Assessment"'));
  const notFound = read("src/app/not-found.tsx");
  check("the 404 is a server component", !notFound.includes('"use client"'));
  check("the 404 has its own title", notFound.includes('title: "Page not found"'));
  check("the 404 quiz CTA is still tracked", notFound.includes('track="quiz"') && notFound.includes('source="not-found"'));
  check("the Course provider is named inline", /name: site\.name,\s*url: SITE_URL,/.test(read("src/lib/structuredData.ts")));
  check("the error page offers info@", read("src/app/error.tsx").includes("info@tennisbootcamp.ca"));

  // ── L13: source-tagged funnel events ──────────────────────────────────────
  console.log("Funnel analytics (L13)");
  check("program pages tag their quiz CTA", /track="quiz"\s+source="program-detail"/.test(detail));
  check("program pages tag their assessment CTA", /track="assessment"\s+source="program-detail"/.test(detail));
  const assessmentPage = read("src/app/assessment/page.tsx");
  check("/assessment tags its CTAs", assessmentPage.includes('source="assessment-price"') && assessmentPage.includes('source="assessment-closing"') && assessmentPage.includes('source="assessment-page"'));
  const booked = read("src/app/assessment/booked/page.tsx");
  check("/assessment/booked counts once per booking id", booked.includes("<BookedTracker bookingId={bookingId} />") && read("src/app/assessment/booked/BookedTracker.tsx").includes("firstSightOfBooking(bookingId, store)"));
  check("/assessment/booked shows the slot", booked.includes("getBookedSlotSummary(bookingId)") && booked.includes("{slot.dateLabel} at {slot.timeLabel}"));
  check("/assessment/booked uses the programs label", booked.includes("Browse Programs") && !booked.includes("Browse programs"));
  const lookup = read("src/lib/assessments.ts").split("export async function getBookedSlotSummary")[1]?.split(/\r?\n\}\r?\n/)[0] ?? "name";
  check("the slot lookup reveals no player or account", !/\b(name|email|phone)\b|\.name|\.email|\.phone/.test(lookup));

  // ── L24: hero image ───────────────────────────────────────────────────────
  console.log("Hero image (L24)");
  const hero = read("src/components/sections/Hero.tsx");
  check("the hero image is a static import", hero.includes('import playerImage from "../../../public/images/hero/player.png"') && hero.includes("src={playerImage}"));
  check("the hero image preloads at high priority", hero.includes("preload") && hero.includes('fetchPriority="high"') && !/\bpriority\r?\n/.test(hero));
  check("AVIF and WebP are served", JSON.stringify(nextConfig.images?.formats) === JSON.stringify(["image/avif", "image/webp"]));
  check("optimized images are cached for a month", nextConfig.images?.minimumCacheTTL === IMAGE_CACHE_TTL_SECONDS && IMAGE_CACHE_TTL_SECONDS >= 60 * 60 * 24 * 30);
  check("static image imports type-check without next-env.d.ts", read("src/types/static-images.d.ts").includes('/// <reference types="next/image-types/global" />'));

  // ── L25: OG cards ─────────────────────────────────────────────────────────
  console.log("OG cards (L25)");
  const ogFiles: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "opengraph-image.tsx") ogFiles.push(full);
    }
  };
  walk(join(ROOT, "src", "app"));
  check("every page card found", ogFiles.length >= 9, String(ogFiles.length));
  for (const file of ogFiles) {
    const src = readFileSync(file, "utf8");
    const short = file.slice(ROOT.length + 1);
    check(`${short} is prerendered, not edge`, !src.includes('runtime = "edge"'));
    check(`${short} loads Geist`, src.includes("fonts: await ogFonts()"));
  }
  check("/intake has its own card", exists("src/app/intake/opengraph-image.tsx"));
  check("the cards carry the brand mark", read("src/lib/og-image.tsx").includes("brandMarkDataUrl()"));
  check("program cards are built ahead", read("src/app/programs/[slug]/opengraph-image.tsx").includes("export function generateStaticParams()"));
  // next/og uses `options.fonts || defaultFonts`: [] skips the bundled face
  // and satori throws, so a Google Fonts outage must yield undefined.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("simulated font outage");
  }) as typeof fetch;
  const { ogFonts } = await import("../lib/og-fonts");
  check("a font outage falls back to the bundled face (undefined, never [])", (await ogFonts()) === undefined);
  globalThis.fetch = realFetch;

  // ── L26: security headers ─────────────────────────────────────────────────
  console.log("Security headers (L26)");
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  const header = (key: string) => all?.headers.find((h) => h.key === key)?.value;
  check("frames are denied", header("X-Frame-Options") === "DENY");
  check("MIME sniffing is off", header("X-Content-Type-Options") === "nosniff");
  check("unused browser features are off", header("Permissions-Policy") === "camera=(), microphone=(), geolocation=()");
  check("Referrer-Policy is unchanged", header("Referrer-Policy") === "strict-origin-when-cross-origin");
  check("every security header is sent", SECURITY_HEADERS.every((h) => header(h.key) === h.value));
  check("no X-Powered-By banner", nextConfig.poweredByHeader === false);

  // ── L27: one PostCSS config ───────────────────────────────────────────────
  console.log("PostCSS (L27)");
  check("the dead Tailwind 4 config is gone", !exists("postcss.config.mjs"));
  check("the Tailwind 3 config stays", exists("postcss.config.js") && read("postcss.config.js").includes("tailwindcss"));
  const pkg = JSON.parse(read("package.json")) as { devDependencies?: Record<string, string> };
  check("@tailwindcss/postcss is no longer installed", !pkg.devDependencies?.["@tailwindcss/postcss"]);

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll platform hygiene checks passed.");
}

void main();
