import type { Metadata } from "next";
import Link from "next/link";
import { locations } from "@/content/locations";
import { formatGroupWhen } from "@/lib/programCatalog";
import { catalogHref, EMPTY_QUERY } from "@/lib/programFilters";
import { programsAtLocation } from "@/lib/locationCatalog";
import { membershipNote } from "@/lib/membership";
import { Container } from "@/components/layout/Container";
import { PageStack } from "@/components/layout/PageStack";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { QuizBand } from "@/components/sections/QuizBand";
import { MapLink, PinIcon } from "@/components/locations/LocationLine";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";

// Our locations (owner, 2026-10-12): the page returns, now naming the club we
// train at. One card per location: the name and area, the map link (a Google
// Maps search, since no street address is published), and what runs there,
// group by group, from the lineup in src/content/programs.ts. The page closes
// on the quiz (audit M13). Static: nothing here changes without a deploy.

const [first] = locations;

/** The search-result line: geography, then what runs there (at most 155 characters, audit M10). */
const LOCATIONS_META_DESCRIPTION =
  locations.length === 1
    ? `Where we train in Toronto: ${first.name}, ${first.locality}. Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, private lessons by arrangement.`
    : "Where we train in Toronto: every Tennis Bootcamp location, and the groups that run at each.";

export const metadata: Metadata = {
  title: "Locations",
  description: LOCATIONS_META_DESCRIPTION,
  alternates: { canonical: "/locations" },
};

const PROGRAM_LINK = `rounded underline-offset-4 hover:underline ${FOCUS_RING}`;

export default function LocationsPage() {
  const single = locations.length === 1;
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="tb-gradient">
        <Container className="py-14 md:py-16">
          <Heading as="h1">Our Locations</Heading>
          <p className="mt-3 max-w-2xl text-pretty text-base text-white/75">
            {single
              ? `We train at one club right now: ${first.name}, in ${first.locality}. Every group and private lesson meets there.`
              : "Every group trains at one of these clubs. Pick yours, then the group that fits your age and level."}
          </p>
        </Container>
      </div>

      <PageStack>
        <div>
          <ul role="list" className="space-y-6">
            {locations.map((location) => {
              const here = programsAtLocation(location.id);
              const headingId = `location-${location.id}`;
              return (
                <li key={location.id}>
                  <section
                    aria-labelledby={headingId}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-[auto_1fr] md:gap-x-12 md:p-8"
                  >
                    {/* The club: name, area and map. What runs there is the
                        list beside it, so no summary line repeats it. */}
                    <div className="min-w-0 md:col-start-1 md:row-start-1">
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#B4E655]/25 bg-[#B4E655]/10 text-[#B4E655]"
                      >
                        <PinIcon className="h-5 w-5" />
                      </span>
                      <h2 id={headingId} className="mt-4 text-2xl font-semibold tracking-tight text-white">
                        {location.name}
                      </h2>
                      <p className="mt-1 text-base text-white/70">{location.area}</p>
                      <p className="mt-1">
                        <MapLink location={location} className={TEXT_LINK_LIME} />
                      </p>
                    </div>

                    {/* What runs here, program by program, each group on its own
                        line: beside the club from md, under it on a phone. */}
                    <div className="mt-8 min-w-0 border-t border-white/10 pt-6 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:border-l md:border-t-0 md:pl-12 md:pt-0">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]">
                        What runs here
                      </h3>
                      <ul role="list" className="mt-4 space-y-6">
                        {here.map(({ program, groups }) => (
                          <li key={program.slug}>
                            <p className="text-base font-semibold tracking-tight text-white">
                              <Link href={`/programs/${program.slug}`} className={PROGRAM_LINK}>
                                {program.title} <span aria-hidden="true">→</span>
                              </Link>
                            </p>
                            <ul role="list" className="mt-2 divide-y divide-white/10 border-y border-white/10">
                              {groups.map((g) => (
                                <li
                                  key={g.id}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-2.5 text-sm"
                                >
                                  <span className="min-w-0 text-white/90">{g.name}</span>
                                  <span className="text-right tabular-nums text-white/70">{formatGroupWhen(g)}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* The catalog at this club: under the club from md, after
                        the list on a phone. */}
                    <div className="mt-8 md:col-start-1 md:row-start-2 md:mt-6 md:self-start">
                      <Button
                        variant="secondary"
                        href={catalogHref({ ...EMPTY_QUERY, location })}
                        className="w-full sm:w-auto"
                      >
                        Browse Programs
                      </Button>
                    </div>
                  </section>
                </li>
              );
            })}
          </ul>

          {/* The club line stays neutral (owner D19 pending): the locked
              membership copy, never a requirement. */}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">{membershipNote()}</p>
        </div>

        <QuizBand source="locations-closing" />
      </PageStack>
    </main>
  );
}
