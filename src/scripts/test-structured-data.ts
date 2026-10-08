// Run from project root: npx tsx src/scripts/test-structured-data.ts
//
// Pins backlog #7: the home page Organization and the /programs/[slug] Course
// JSON-LD carry their required fields, every absolute URL starts with
// SITE_URL, the Offer price follows SESSION_PRICE and COHORT_WEEKS, and no
// invented data (ratings, reviews, street address) appears. Exits non-zero on
// any failure.

import { COHORT_WEEKS, SESSION_PRICE, listedPrograms } from "../content/programs";
import { site } from "../content/site";
import { SITE_URL } from "../lib/siteUrl";
import {
  ORGANIZATION_ID,
  courseJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  type JsonLdObject,
} from "../lib/structuredData";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const BANNED_KEYS = ["aggregateRating", "review", "reviews", "address", "streetAddress", "telephone"];

function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

function urlsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" && /^https?:\/\//.test(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => urlsIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => urlsIn(v, out));
  return out;
}

function noInventedData(label: string, data: JsonLdObject) {
  const keys = allKeys(data);
  const hit = BANNED_KEYS.filter((k) => keys.includes(k));
  check(`${label}: no ratings, reviews or address`, hit.length === 0, hit.join(", "));
  const foreign = urlsIn(data).filter((u) => u !== "https://schema.org" && !u.startsWith(SITE_URL));
  check(`${label}: every absolute URL starts with SITE_URL`, foreign.length === 0, foreign.join(", "));
  const roundTrip = JSON.parse(serializeJsonLd(data));
  check(`${label}: serialises to valid JSON`, JSON.stringify(roundTrip) === JSON.stringify(data));
}

// ── Organization ────────────────────────────────────────────────────────────
console.log("Organization (home page)");
const org = organizationJsonLd();
check("@context is schema.org", org["@context"] === "https://schema.org");
check("@type is Organization", org["@type"] === "Organization");
check("@id is SITE_URL/#organization", org["@id"] === `${SITE_URL}/#organization`);
check("name is the site name", org.name === site.name && org.name === "Tennis Bootcamp");
check("url is SITE_URL", org.url === SITE_URL);
check("email is info@tennisbootcamp.ca", org.email === "info@tennisbootcamp.ca");
check("areaServed is Toronto", (org.areaServed as JsonLdObject)?.name === "Toronto");
const founder = org.founder as JsonLdObject | undefined;
check("founder is Sina Kassaian (Person)", founder?.["@type"] === "Person" && founder?.name === "Sina Kassaian");
check("logo is the brand logo on SITE_URL", org.logo === `${SITE_URL}/images/brand/logo.svg`);
noInventedData("Organization", org);

// ── Course, one per listed program ──────────────────────────────────────────
for (const program of listedPrograms) {
  console.log(`Course (/programs/${program.slug})`);
  const course = courseJsonLd(program);
  check("@type is Course", course["@type"] === "Course");
  check("name is the program title", course.name === program.title);
  check("description is present", typeof course.description === "string" && (course.description as string).length > 0);
  check("url is the program page on SITE_URL", course.url === `${SITE_URL}/programs/${program.slug}`);
  check("provider is the Organization by @id", (course.provider as JsonLdObject)?.["@id"] === ORGANIZATION_ID);

  const instance = course.hasCourseInstance as JsonLdObject | undefined;
  check("CourseInstance is present", instance?.["@type"] === "CourseInstance");
  check("courseMode is onsite", instance?.courseMode === "onsite");
  check("schedule text is the program's schedule", instance?.courseWorkload === program.schedule);

  const offer = course.offers as JsonLdObject | undefined;
  if (program.comingSoon) {
    check("coming soon: no Offer (no session price stated)", offer === undefined);
  } else {
    check("Offer is present", offer?.["@type"] === "Offer");
    check("price is SESSION_PRICE", offer?.price === SESSION_PRICE);
    check("currency is CAD", offer?.priceCurrency === "CAD");
    const spec = offer?.priceSpecification as JsonLdObject | undefined;
    check("unit price is SESSION_PRICE per session",
      spec?.price === SESSION_PRICE &&
      (spec?.referenceQuantity as JsonLdObject)?.unitText === "session");
    check("eligible quantity is COHORT_WEEKS sessions",
      (offer?.eligibleQuantity as JsonLdObject)?.value === COHORT_WEEKS);
    check("schedule repeats weekly COHORT_WEEKS times",
      (instance?.courseSchedule as JsonLdObject)?.repeatCount === COHORT_WEEKS &&
      (instance?.courseSchedule as JsonLdObject)?.repeatFrequency === "P1W");
    check("offer description is the page's price line", offer?.description === program.priceLine);
  }
  noInventedData("Course", course);
}

// ── Serialiser can't be closed early ────────────────────────────────────────
console.log("Serialiser");
check("escapes < so </script> can't break out",
  !serializeJsonLd({ x: "</script><b>" }).includes("<"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll structured data checks passed.");
