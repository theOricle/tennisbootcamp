import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { locations } from "@/content/locations";
import { programGroups } from "@/content/programs";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { readBlockSeats } from "@/lib/groupSeats";
import { groupCards } from "@/lib/groupBlocks";
import { catalogHref, EMPTY_QUERY } from "@/lib/programFilters";
import { cardWhen, cardsAtLocation } from "@/lib/locationCatalog";
import { membershipNote } from "@/lib/membership";
import { Container } from "@/components/layout/Container";
import { PageStack } from "@/components/layout/PageStack";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { JoinClosing } from "@/components/sections/JoinClosing";
import { MapLink, PinIcon } from "@/components/locations/LocationLine";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";

// Our locations (owner, 2026-10-12): the page returns, now naming the club we
// train at. One card per location: the name and area, the map link (a Google
// Maps search, since no street address is published), and what runs there,
// group by group, from the same group cards /programs shows (backlog #99;
// src/lib/groupBlocks.ts): an open block's class days, times and dates, and a
// planned group with none in its card's own words. The page closes on the
// main action (audit M13).

// Incremental static regeneration, as /programs: the open blocks and their
// seats are read the way that page reads them, at most once a minute, so a
// row follows its group's card. A change to a block in admin or payment
// rebuilds it at once with /programs (COHORT_PAGES, src/lib/cohortRevalidate.ts;
// backlog #100). A read that fails lists every planned group as its card
// reads with no open block, never an error.
export const revalidate = 60;

const [first] = locations;

/**
 * The search-result line: geography, then what runs there (at most 155
 * characters, audit M10). No weekday (backlog #99): each group's days are its
 * card's, and an open block may run on another day.
 */
const LOCATIONS_META_DESCRIPTION =
  locations.length === 1
    ? `Where we train in Toronto: ${first.name}, ${first.locality}. Youth Bootcamps and Adult Bootcamps by age and level, private lessons by arrangement.`
    : "Where we train in Toronto: every Tennis Bootcamp location, and the groups that run at each.";

export const metadata: Metadata = {
  title: "Locations",
  description: LOCATIONS_META_DESCRIPTION,
  alternates: { canonical: "/locations" },
};

const PROGRAM_LINK = `rounded underline-offset-4 hover:underline ${FOCUS_RING}`;

/** A part that ends with a class's time: "12–1pm", "11am–12pm", "6:30–7:30pm" (formatClassHours). */
const ENDS_WITH_TIME = /\d(?:am|pm)?–\d\S*$/;

/**
 * "Saturdays 12–1pm, Wednesdays 6–7pm" with each day kept with its time
 * (backlog #100). Each part, one per time, is a box of its own
 * (inline-block), so the line breaks between parts, at a comma, and keeps a
 * part whole wherever it fits. A part wider than the row ("Wednesdays and
 * Saturdays 11:30am–12:30pm" on a small phone) wraps between its words, its
 * last day kept with the time and the time never broken, so no line of class
 * days pushes the page sideways. The words are the card's own
 * (formatClassDays).
 */
function ClassDaysKeptWhole({ text }: { text: string }) {
  // One part per time: a day with no time of its own ("Mondays" in "Mondays,
  // Wednesdays and Fridays 6–7pm") joins the part whose time it shares.
  const parts: string[] = [];
  let pending = "";
  for (const piece of text.split(", ")) {
    pending = pending ? `${pending}, ${piece}` : piece;
    if (ENDS_WITH_TIME.test(piece)) {
      parts.push(pending);
      pending = "";
    }
  }
  if (pending) parts.push(pending);
  return (
    <>
      {parts.map((part, i) => {
        const words = (i < parts.length - 1 ? `${part},` : part).split(" ");
        // The last day and its time stay together; the words before them may wrap.
        const kept = ENDS_WITH_TIME.test(part) ? Math.min(2, words.length) : words.length;
        const lead = words.slice(0, words.length - kept).join(" ");
        return (
          <Fragment key={`${i}-${part}`}>
            {i > 0 && " "}
            <span className="inline-block">
              {lead && `${lead} `}
              <span className="whitespace-nowrap">{words.slice(words.length - kept).join(" ")}</span>
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * The dates on one line: a block's "Dec 5, 2026 – Jan 13, 2027" never breaks
 * inside a date or at its dash (backlog #100), and "Dates coming soon" stays
 * whole too.
 */
function DatesKeptWhole({ text }: { text: string }) {
  return <span className="whitespace-nowrap">{text}</span>;
}

export default async function LocationsPage() {
  const publicCohorts = await getPublicCohorts();
  const seats = await readBlockSeats(publicCohorts);
  // One card per open block, and one per planned group with none, as on
  // /programs. No row shows a seat count; the seats keep the cards the same.
  const cards = groupCards(programGroups, publicCohorts, seats);
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
              const here = cardsAtLocation(location.id, cards);
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
                        line, as its card on /programs says when it runs: beside
                        the club from md, under it on a phone. */}
                    <div className="mt-8 min-w-0 border-t border-white/10 pt-6 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:border-l md:border-t-0 md:pl-12 md:pt-0">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]">
                        What runs here
                      </h3>
                      <ul role="list" className="mt-4 space-y-6">
                        {here.map(({ program, cards: programCards }) => (
                          <li key={program.slug}>
                            <p className="text-base font-semibold tracking-tight text-white">
                              <Link href={`/programs/${program.slug}`} className={PROGRAM_LINK}>
                                {program.title} <span aria-hidden="true">→</span>
                              </Link>
                            </p>
                            {/* Each row: the group's name, then its class days
                                and times over its dates, at the row's right
                                edge. A line of class days breaks only at a
                                comma and the dates never break, so when they
                                do not fit beside a name at least 7rem wide (a
                                block twice a week, dates across a new year, on
                                a phone) they take a line of their own under
                                the name, still at the right edge, and never
                                squeeze it (backlog #100). */}
                            <ul role="list" className="mt-2 divide-y divide-white/10 border-y border-white/10">
                              {programCards.map((card) => {
                                const when = cardWhen(card);
                                return (
                                  <li
                                    key={card.group.id}
                                    className="flex flex-wrap items-start gap-x-4 gap-y-0.5 py-2.5 text-sm"
                                  >
                                    <span className="min-w-0 grow basis-28 text-white/90">{card.group.name}</span>
                                    <span className="ml-auto text-right tabular-nums text-white/70">
                                      <span className="block">
                                        <ClassDaysKeptWhole text={when.classDays} />
                                      </span>
                                      {when.dates && (
                                        <span className="block">
                                          <DatesKeptWhole text={when.dates} />
                                        </span>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
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

        <JoinClosing source="locations-closing" />
      </PageStack>
    </main>
  );
}
