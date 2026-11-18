// Run from project root: npx tsx src/scripts/test-locations.ts
//
// Pins audit item N (owner, 2026-10-12: "Right now we are only at Newtonbrook
// Tennis Club in North York"; "People need to choose location first"):
//   1. the locations list: one club, a name and an area, a Google Maps search
//      link, and nothing the owner has not given (no street address, hours or
//      court counts); every group trains at a listed location;
//   2. the catalog query: ?location= is read, the one location is
//      preselected and left out of the URL, Clear filters keeps it, and the
//      groups are filtered by it;
//   3. the surfaces: on /programs the Location is the first of the three
//      dropdowns (backlog #69, owner-approved design 2026-11-17; it replaced
//      the "Where do you want to train?" cards), group cards and program
//      pages show the club, the home page has "Where we train", /locations
//      stays (footer, sitemap; the top menu is Programs and About), the
//      enroll summary and confirmation show the Location first, and the
//      dashboard names the club;
//   4. the stand-ins are gone: no VENUE_LINE anywhere, the invitation names
//      the club, and the club-membership line stays neutral (D19).
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultLocation,
  locationById,
  locationForCohort,
  locationLine,
  locations,
  mapsSearchUrl,
} from "../content/locations";
import { COHORT_TOTAL_LABEL, listedPrograms, programGroups } from "../content/programs";
import { JOIN_CTA_LABEL } from "../lib/mainAction";
import {
  cohortWhereLine,
  groupsAtLocation,
  joinWithAnd,
  locationProgramsLine,
  locationSummary,
  locationsForProgram,
  programsAtLocation,
} from "../lib/locationCatalog";
import {
  EMPTY_QUERY,
  catalogHref,
  catalogQueryString,
  clearFilters,
  filterGroups,
  initialCatalogQuery,
  isEmptyQuery,
  locationQueryFor,
  parseCatalogQuery,
} from "../lib/programFilters";
import { membershipNote } from "../lib/membership";
import { buildCohortInviteEmail } from "../lib/emailBodies";
import { NAV_LINKS, FOOTER_GROUPS } from "../content/site";
import sitemap from "../app/sitemap";
import { LocationBlock, LocationLine } from "../components/locations/LocationLine";
import { ProgramCatalogView } from "../components/sections/ProgramCatalog";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { WhereAndWho } from "../components/sections/WhereAndWho";
import { coaches } from "../content/coaches";
import LocationsPage from "../app/locations/page";
import type { ProgramGroup } from "../types/program";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const at = (hay: string, needle: string) => hay.indexOf(needle);
const params = (s: string) => new URLSearchParams(s);

const NAME = "Newtonbrook Tennis Club";
const AREA = "North York, Toronto";
const MAPS = "https://www.google.com/maps/search/?api=1&query=Newtonbrook%20Tennis%20Club%20North%20York";

// ── 1. The data ─────────────────────────────────────────────────────────────
console.log("The locations list (owner, 2026-10-12)");
const club = locationById("newtonbrook");
check("one location today: Newtonbrook Tennis Club", locations.length === 1 && club?.name === NAME);
check("its area is North York, Toronto", club?.area === AREA && club?.locality === "North York" && club?.region === "ON" && club?.country === "CA");
check("the map link is a Google Maps search for the club, no address", club?.mapsUrl === MAPS && mapsSearchUrl("Newtonbrook Tennis Club North York") === MAPS);
check(
  "nothing the owner has not given: no address, hours, courts, phone or website",
  locations.every((l) => Object.keys(l).every((k) => ["id", "name", "area", "locality", "region", "country", "mapsUrl"].includes(k)))
);
check("the one location is the default (preselected)", defaultLocation()?.id === "newtonbrook");
check("locationLine is name, then area", club !== undefined && locationLine(club) === `${NAME}, ${AREA}`);
check("every group names a listed location", programGroups.every((g) => locationById(g.locationId) !== undefined));
check("every group trains at Newtonbrook", programGroups.every((g) => g.locationId === "newtonbrook"));
check("every listed program trains there", listedPrograms.every((p) => locationsForProgram(p.slug).map((l) => l.id).join() === "newtonbrook"));
check("groupsAtLocation is the whole lineup today", groupsAtLocation("newtonbrook").length === programGroups.length && groupsAtLocation("elsewhere").length === 0);

console.log("Where a cohort trains");
check("no note: the default location", locationForCohort({ locationId: "" })?.id === "newtonbrook");
check("a note naming the club picks it", locationForCohort({ locationId: "Newtonbrook, court 3" })?.id === "newtonbrook");
check("a court-only note still reads the one location", locationForCohort({ locationId: "Court 2, meet at the gate" })?.id === "newtonbrook");
check("the invite's Where line names the club", cohortWhereLine({ locationId: "" }) === `${NAME}, ${AREA}`);

console.log("What runs there");
check("Oxford-comma list", joinWithAnd(["a"]) === "a" && joinWithAnd(["a", "b"]) === "a and b" && joinWithAnd(["a", "b", "c"]) === "a, b, and c");
check(
  "programs at the club, in catalog order, with their days",
  programsAtLocation("newtonbrook").map((p) => p.phrase).join(" | ") ===
    "Youth Bootcamps on Saturdays | Adult Bootcamps on Sundays | Private Lessons by arrangement"
);
check(
  "the programs line",
  club !== undefined &&
    locationProgramsLine(club) === "Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, and Private Lessons by arrangement."
);
check(
  "the one honest line, true while there is one club",
  club !== undefined &&
    locationSummary(club) ===
      "All our training is here right now: Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, and Private Lessons by arrangement."
);
check("a club with no groups says so", club !== undefined && locationSummary(club, []) === "No groups train here yet.");

// ── 2. The catalog query ────────────────────────────────────────────────────
console.log("The catalog query: location first");
check("?location= is read", parseCatalogQuery(params("location=newtonbrook")).location?.id === "newtonbrook" && locationQueryFor("Newtonbrook")?.id === "newtonbrook");
check("no or unknown location reads as the default", parseCatalogQuery(params("")).location?.id === "newtonbrook" && parseCatalogQuery(params("location=nowhere")).location?.id === "newtonbrook");
check("the preselected location stays out of the URL", catalogQueryString(parseCatalogQuery(params("location=newtonbrook&age=14"))) === "age=14" && catalogHref(initialCatalogQuery()) === "/programs");
check("the location is a choice, not a filter", isEmptyQuery(parseCatalogQuery(params("location=newtonbrook"))));
const filtered = parseCatalogQuery(params("age=14&level=intermediate"));
const cleared = clearFilters(filtered);
check("Clear filters keeps the location", cleared.location?.id === "newtonbrook" && cleared.age === null && cleared.tier === null);
check("the initial query preselects the club", initialCatalogQuery().location?.id === "newtonbrook" && initialCatalogQuery().age === null);
const elsewhere: ProgramGroup = { ...programGroups[0], id: "elsewhere-7-10", locationId: "elsewhere" };
check(
  "groups are filtered by the chosen location",
  filterGroups([...programGroups, elsewhere], initialCatalogQuery()).length === programGroups.length &&
    filterGroups([...programGroups, elsewhere], EMPTY_QUERY).length === programGroups.length + 1
);

// ── 3. The surfaces ─────────────────────────────────────────────────────────
console.log("/programs: the Location is the first dropdown");
const catalogPrograms = listedPrograms.map((p) => ({ slug: p.slug, title: p.title }));
const catalogView = (query = initialCatalogQuery()) =>
  render(createElement(ProgramCatalogView, { programs: catalogPrograms, groups: programGroups, nextCohorts: {}, header: null, query, onChange: () => {} }));
const view = catalogView();
check("three labelled dropdowns, the location first", at(view, ">Location</label>") > 0 && at(view, ">Location</label>") < at(view, ">Player&#x27;s age</label>") && at(view, ">Player&#x27;s age</label>") < at(view, ">Level</label>") && (view.match(/<select /g) ?? []).length === 3);
check("each dropdown is tied to its label", (view.match(/<label for="/g) ?? []).length === 3 && [...view.matchAll(/<label for="([^"]+)"/g)].every(([, id]) => view.includes(`<select id="${id}"`)));
check("the one location is the only option, already chosen: the club and its area", view.includes(`<option value="newtonbrook" selected="">${NAME} · North York</option>`) && !view.includes("All locations"));
check("they sit in a fieldset with a legend", view.includes("<fieldset") && view.includes('<legend class="sr-only">Filter the groups</legend>'));
check("no chooser cards and no map link in the band (the map link stays on home, the program pages and /locations)", !view.includes("Where do you want to train?") && !view.includes('type="radio"') && !view.includes("google.com/maps"));
const programsPage = read("src/app/programs/page.tsx");
check("/programs: no location section of its own, the catalog carries the dropdown", !programsPage.includes("LocationChoice") && programsPage.includes("<ProgramCatalog"));
const catalogSrc = read("src/components/sections/ProgramCatalog.tsx");
check("the catalog clears filters but keeps the location, and starts preselected", catalogSrc.includes("onChange(clearFilters(query))") && !catalogSrc.includes("onChange(EMPTY_QUERY)") && catalogSrc.includes("query={initialCatalogQuery()}"));
check("the dropdown writes the same ?location= the catalog reads, in Suspense, with replaceState", catalogSrc.includes("location: locationQueryFor(e.target.value)") && catalogSrc.includes("useSearchParams()") && catalogSrc.includes("<Suspense") && catalogSrc.includes("window.history.replaceState(null"));
check("a second location would add an All locations option", catalogSrc.includes('{locations.length > 1 && <option value="">All locations</option>}'));

console.log("Group cards and program pages show the club");
const youth = listedPrograms[0];
const card = render(createElement(ProgramGroupCard, { group: programGroups[0], program: youth }));
check("the where line: the club's name, a plain line with a pin and no label", card.includes(`${NAME}</li>`) && !card.includes(">Where<") && !card.includes("<dt"));
check("the area left the card (it is on the page, beside the club's name)", !card.includes("North York"));
// Re-pinned for backlog #70: the price is the cohort total now, not "… a session".
check("where sits after when and before the price", at(card, "Saturdays 12:00–1:00 pm") > 0 && at(card, "Saturdays 12:00–1:00 pm") < at(card, `${NAME}</li>`) && at(card, `>${COHORT_TOTAL_LABEL}</span>`) > 0 && at(card, `${NAME}</li>`) < at(card, `>${COHORT_TOTAL_LABEL}</span>`));
check("the card keeps one link (no map link on a card)", (card.match(/<a /g) ?? []).length === 1 && !card.includes("google.com/maps"));
check("every group card shows the club", programGroups.filter((g) => g.day !== null).every((g) => render(createElement(ProgramGroupCard, { group: g, program: listedPrograms.find((p) => p.slug === g.programSlug)! })).includes(`${NAME}</li>`)));
const line = render(createElement(LocationLine, { location: club!, mapLink: true }));
check("LocationLine: name · area · map link", line.includes(`>${NAME}</span>`) && line.includes(`</span>${AREA}</span>`) && line.includes("Open in Google Maps"));
const detail = read("src/app/programs/[slug]/page.tsx");
check("program pages show the location with its map link", detail.includes("<LocationLine key={l.id} location={l} mapLink") && detail.includes("locationsForProgram(program.slug)"));
check("program pages: the cohort list names the club, not a stand-in", detail.includes("At {programLocations.map(locationLine).join(\" and \")}.") && !detail.includes("VENUE_LINE"));
check("program pages: the cohort list keeps the neutral club-membership line (D19)", detail.includes("<p>{membershipNote()}</p>"));

console.log("Home: Where we train");
const home = read("src/app/page.tsx");
check("the home page renders where and who after the programs and the joining steps", home.includes("<WhereAndWho />") && at(home, "<ProgramsGrid") < at(home, "<WhereAndWho />") && at(home, "<HowJoiningWorks") < at(home, "<WhereAndWho />"));
const section = render(createElement(WhereAndWho));
check("a labelled section headed Where we train", section.includes('<section aria-labelledby="where-we-train"') && /<h2 id="where-we-train"[^>]*>.*Where we train<\/h2>/.test(section));
check("the name, the area and the map link, from the locations list", section.includes(`>${NAME}</p>`) && section.includes(`>${AREA}</p>`) && section.includes(MAPS.replace(/&/g, "&amp;")) && section.includes(`(${NAME}, opens in a new tab)`));
check("no boxes: hairlines only", !section.includes("rounded-2xl") && !section.includes("bg-white/"));
check("beside it, Coaching: the lead coach's name and title from coaches.ts, and the way to About", section.includes('<section aria-labelledby="coaching"') && section.includes(`>${coaches[0].name}</p>`) && section.includes(`>${coaches[0].role}</p>`) && /<a [^>]*href="\/about"[^>]*>About us/.test(section));
check("the component types no club and no coach: both come from content", !read("src/components/sections/WhereAndWho.tsx").includes("Newtonbrook") && read("src/components/sections/WhereAndWho.tsx").includes("{lead.name}") && read("src/components/sections/WhereAndWho.tsx").includes("{location.name}"));

console.log("/locations is back");
const page = render(createElement(LocationsPage));
check("an h1, Our Locations", page.includes(">Our Locations</h1>"));
check("the intro names the club plainly", page.includes(`We train at one club right now: ${NAME}, in North York. Every group and private lesson meets there.`));
check("a card per club with its h2, area and map link", page.includes(`>${NAME}</h2>`) && page.includes(`>${AREA}</p>`) && page.includes(MAPS.replace(/&/g, "&amp;")));
check("what runs there, every group with its time", programGroups.every((g) => page.includes(`>${g.name}</span>`)) && page.includes("Saturdays 12:00–1:00 pm") && page.includes("By arrangement"));
check("each program links to its page", listedPrograms.every((p) => page.includes(`href="/programs/${p.slug}"`)));
check("Browse Programs to the catalog, the club line neutral, and the main action to close", page.includes(">Browse Programs<") && page.includes('href="/programs"') && page.includes(membershipNote()) && page.includes(">Groups are open to join.</h2>") && page.includes(`>${JOIN_CTA_LABEL}</a>`) && JOIN_CTA_LABEL === "Join a bootcamp" && !page.includes("Join a group") && page.includes("Not sure which group?") && page.includes("Take the 2-minute quiz"));
const locationsSrc = read("src/app/locations/page.tsx");
check("its metadata: a canonical and a description under 155 characters", locationsSrc.includes('alternates: { canonical: "/locations" }') && /LOCATIONS_META_DESCRIPTION =/.test(locationsSrc));
check("no street address, hours or courts on the page", !/\b(St|Ave|Rd|Blvd)\b\.?\s|\bhours\b|\bcourts\b/i.test(page.replace(/<[^>]+>/g, " ")));
// Owner, 2026-11-16: the top menu is Programs and About; Locations moved to the footer.
check("Locations in the footer, beside Programs, and no longer in the top menu", FOOTER_GROUPS[0].links[1]?.href === "/locations" && FOOTER_GROUPS[0].links[1]?.label === "Locations" && !NAV_LINKS.some((l) => l.href === "/locations"));
check("/locations in the sitemap", sitemap().some((e) => e.url.endsWith("/locations")));

console.log("Enrollment shows the location first");
const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
const summary = wizard.slice(at(wizard, "function OrderSummary("), at(wizard, "function RegistrantStep("));
check("the summary resolves the cohort's location", summary.includes("const location = locationForCohort(cohort);"));
check("the Location box is the first fact, before the plate and the program", at(summary, ">Location</p>") > 0 && at(summary, ">Location</p>") < at(summary, "<ProgramPlate") && at(summary, ">Location</p>") < at(summary, "{program?.title ?? cohort.programId}"));
check("with the club's name, area and map link", summary.includes("{location.name}") && summary.includes("{location.area}") && summary.includes("<MapLink location={location}"));
check(
  "the neutral club-membership line sits under the Location box, before the plate (D19)",
  at(summary, "{membershipNote()}") > at(summary, "<MapLink location={location}") && at(summary, "{membershipNote()}") < at(summary, "<ProgramPlate")
);
const confirmed = read("src/app/enroll/[cohortId]/confirmed/page.tsx");
check("the confirmation lists the Location first", at(confirmed, ">Location</span>") > 0 && at(confirmed, ">Location</span>") < at(confirmed, ">Program</span>") && confirmed.includes("{location.name}"));
const block = render(createElement(LocationBlock, { location: club! }));
check("the dashboard's block: name, area, a 44px map link", block.includes(`>${NAME}</p>`) && block.includes(`>${AREA}</p>`) && block.includes("min-h-[44px]"));
check("the dashboard names the club where we train", read("src/app/dashboard/DashboardView.tsx").includes("<LocationBlock location={l} />") && read("src/app/dashboard/page.tsx").includes("<LocationBlock location={l} />"));

// ── 4. The stand-ins are gone ───────────────────────────────────────────────
console.log("No venue stand-ins");
const sources = [
  "src/app/programs/[slug]/page.tsx",
  "src/app/enroll/[cohortId]/EnrollWizard.tsx",
  "src/app/enroll/[cohortId]/confirmed/page.tsx",
  "src/app/dashboard/DashboardView.tsx",
  "src/app/dashboard/page.tsx",
  "src/lib/membership.ts",
];
check("VENUE_LINE is gone from every surface and from membership.ts", sources.every((f) => !read(f).includes("VENUE_LINE")));
check(
  "the club-membership line is unchanged and neutral (D19, locked)",
  membershipNote() === "Court details and any club requirements are confirmed in your booking email."
);
const invite = buildCohortInviteEmail({
  participantName: "Alex Doe",
  levelLabel: "3.0",
  tierNames: ["Intermediate"],
  programTitle: "Adult Bootcamps",
  cohortLabel: "Fall Intermediate",
  dayTimeLabel: "Sundays 5–6pm",
  startDateLabel: "Oct 18",
  weeks: 6,
  priceCents: 21000,
  creditCents: 0,
  holdHours: 48,
  enrollUrl: "https://example.test/enroll/x?invite=t",
});
check("the invitation names the club (HTML and text)", invite.html.includes(`${NAME}, ${AREA}`) && invite.text.includes(`Where:    ${NAME}, ${AREA}`));
check("the invitation no longer defers the venue to another email", !invite.html.includes("Court details are confirmed") && !invite.text.includes("Court details are confirmed"));
check("the admin action passes the cohort's location", read("src/lib/cohortActions.ts").includes("locationLine: cohortWhereLine(cohort),"));

// ── Wiring ──────────────────────────────────────────────────────────────────
console.log("Wiring");
const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
check("npm test runs this script", pkg.scripts.test.includes("npx tsx src/scripts/test-locations.ts"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll location checks passed.");
