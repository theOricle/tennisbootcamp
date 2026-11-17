"use client";

import Link from "next/link";
import { Suspense, useId, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { Cohort } from "@/types/cohort";
import type { Program, ProgramGroup } from "@/types/program";
import { TIERS } from "@/lib/tiers";
import {
  AGE_BAND_QUERIES,
  EXACT_AGES,
  ageQueryFor,
  catalogQueryString,
  clearFilters,
  closestGroups,
  exactAgeQuery,
  filterGroups,
  initialCatalogQuery,
  locationQueryFor,
  parseCatalogQuery,
  resultsLine,
  tierQueryFor,
  type CatalogQuery,
} from "@/lib/programFilters";
import { programHeadingLine } from "@/lib/programCatalog";
import { GROUPS_ANCHOR, QUIZ_CTA_LABEL } from "@/lib/mainAction";
import { RIGHT_GROUP_PROMISE } from "@/content/programs";
import { locations } from "@/content/locations";
import { Container } from "@/components/layout/Container";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { INLINE_LIME_LINK, PADDED_INLINE_LINK, QuizSideLine } from "@/components/ui/MainAction";
import { QuizSwap } from "@/components/quiz/QuizSwap";
import { FOCUS_RING } from "@/components/ui/focus";
import { ArrangedGroupRow, ProgramGroupCard } from "./ProgramGroupCard";

// The /programs catalog (owner, 2026-10-12; the simpler page, owner-approved
// design 2026-11-17). The header band carries the page's title and lead (the
// page passes them in), then three labelled dropdowns in one row — Location
// first ("People need to choose location first"), Player's age, Level — the
// five levels as one strip, and the quiz as a side line. Under the band,
// every group at the chosen location under its program's heading row: a
// card per group with a fixed class, one row for a group booked by
// arrangement (private lessons).
//
// The filters are carried in the URL (?location=…&age=14&level=intermediate)
// so a filtered list can be shared and the quiz result can link to one. The
// level filter matches a group's one level tag exactly (owner, 2026-10-13);
// when a program has no group at the chosen level, its nearest-level groups
// follow under "Closest fit" with the week-one promise, never a dead end.
// The page is static (ISR); the filters are read and written in the browser
// with the native history API, so no request is made when a select changes.
// The server prerenders the unfiltered list as the Suspense fallback, so a
// crawler and a reader with no script see every group.

/** The program data the catalog needs, serialisable for the client. */
export type CatalogProgram = Pick<Program, "slug" | "title">;

export type ProgramCatalogProps = {
  programs: CatalogProgram[];
  groups: ProgramGroup[];
  /** The earliest public cohort per group id, already fetched by the page. */
  nextCohorts: Record<string, Cohort>;
  /** Seats left in those cohorts, by group id, read once by the page (src/lib/groupSeats.ts). */
  seats?: Record<string, number>;
  /** The band's title and lead, rendered by the page. */
  header: ReactNode;
  /** The five-levels strip, rendered by the page; it sits under the dropdowns. */
  levels?: ReactNode;
};

// A dropdown shows its chosen value whole. On phones Age and Level share a
// row, so the padding and the chevron's room are tighter there, and the
// value is 14px below 375 wide and 16px from 375 (the width iPhones start
// at, where anything smaller makes Safari zoom the page on a tap). A value
// that still cannot fit (the location on the narrowest phones) ends in an
// ellipsis, never a sliced letter.
const SELECT_CLASS =
  "min-h-[44px] w-full appearance-none truncate rounded-full border border-white/35 bg-[#061427] py-2 pl-3 pr-7 text-sm text-white " +
  `hover:border-white/50 min-[375px]:text-base md:pl-4 md:pr-10 md:text-[15px] ${FOCUS_RING}`;
const CHEVRON =
  "pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60 md:right-4";
const FIELD_LABEL = "mb-1.5 block text-[13px] text-white/70";
const SECTION_TITLE = "text-[22px] font-semibold leading-tight tracking-tight text-white";
const GROUP_GRID = "mt-3.5 grid gap-3 md:grid-cols-3 md:gap-4";

function Chevron() {
  return (
    <svg aria-hidden="true" className={CHEVRON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
    </svg>
  );
}

/**
 * Three labelled dropdowns: the location on a row of its own on phones, all
 * three in one row from md. On phones the Level column is the wider of the
 * two under it (11 to 14), so the longest level and the longest age band
 * both show whole. While there is one location it is the only option,
 * already chosen; a second one adds "All locations".
 */
function Filters({
  query,
  onChange,
}: {
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
}) {
  const locationId = useId();
  const ageId = useId();
  const levelId = useId();
  return (
    <fieldset className="mt-[22px] grid max-w-[860px] grid-cols-[minmax(0,11fr)_minmax(0,14fr)] gap-3 md:grid-cols-[1.75fr_0.9fr_1fr] md:gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
      <legend className="sr-only">Filter the groups</legend>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <label htmlFor={locationId} className={FIELD_LABEL}>
          Location
        </label>
        <div className="relative">
          <select
            id={locationId}
            value={query.location?.id ?? ""}
            onChange={(e) => onChange({ ...query, location: locationQueryFor(e.target.value) })}
            className={SELECT_CLASS}
          >
            {locations.length > 1 && <option value="">All locations</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.locality}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor={ageId} className={FIELD_LABEL}>
          Player&apos;s age
        </label>
        <div className="relative">
          <select
            id={ageId}
            value={query.age?.value ?? ""}
            onChange={(e) => onChange({ ...query, age: ageQueryFor(e.target.value) })}
            className={SELECT_CLASS}
          >
            <option value="">Any age</option>
            <optgroup label="Age group">
              {Object.values(AGE_BAND_QUERIES).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Exact age">
              {EXACT_AGES.map((age) => (
                <option key={age} value={String(age)}>
                  {exactAgeQuery(age)?.label ?? age}
                </option>
              ))}
            </optgroup>
          </select>
          <Chevron />
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor={levelId} className={FIELD_LABEL}>
          Level
        </label>
        <div className="relative">
          <select
            id={levelId}
            value={query.tier?.slug ?? ""}
            onChange={(e) => onChange({ ...query, tier: tierQueryFor(e.target.value) })}
            className={SELECT_CLASS}
          >
            <option value="">Any level</option>
            {TIERS.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </div>
    </fieldset>
  );
}

/** A program's heading row: its title, linked to its page, and one derived line ("Saturdays · ages 7–17"). */
function ProgramHeading({ program, groups }: { program: CatalogProgram; groups: ProgramGroup[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 id={`catalog-${program.slug}`} className={SECTION_TITLE}>
        {/* A 44px target with the ring on the words: the side line's padded inline link, so the row keeps its height. */}
        <Link href={`/programs/${program.slug}`} className={`underline-offset-4 hover:underline ${PADDED_INLINE_LINK}`}>
          {program.title}
        </Link>
      </h2>
      <p className="text-sm text-white/60">{programHeadingLine(groups)}</p>
    </div>
  );
}

/**
 * "Closest fit" (owner, 2026-10-13): the nearest-level groups of every
 * program that has none at the chosen level (closestGroups), with one honest
 * line about week-one placement. The line names the chosen level and age
 * and nothing more, because another program may have matched exactly above
 * (a teen at Intermediate sees the adult group, then the youth program's
 * nearest). Each card's title names its group, so cards from more than one
 * program read apart.
 */
function ClosestFit({
  groups,
  programs,
  nextCohorts,
  seats,
  query,
}: {
  groups: ProgramGroup[];
  programs: CatalogProgram[];
  nextCohorts: Record<string, Cohort>;
  seats: Record<string, number>;
  query: CatalogQuery;
}) {
  if (groups.length === 0 || !query.tier) return null;
  const scope = query.age ? ` for ${query.age.phrase}` : "";
  return (
    <section aria-labelledby="closest-fit" className="pt-8 md:pt-11">
      <h2 id="closest-fit" className={SECTION_TITLE}>
        Closest fit
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
        The nearest levels to {query.tier.name}{scope}. Your coach confirms your level on court in
        week one. {RIGHT_GROUP_PROMISE}
      </p>
      <ul role="list" className={GROUP_GRID}>
        {groups.map((g) => {
          const program = programs.find((p) => p.slug === g.programSlug);
          if (!program) return null;
          return (
            <li key={g.id} className="flex [&>*]:w-full">
              <ProgramGroupCard
                group={g}
                program={program}
                nextCohort={nextCohorts[g.id]}
                seatsLeft={seats[g.id]}
                source="programs-closest"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The catalog as pure markup for a given query; the live wrapper owns the state. */
export function ProgramCatalogView({
  programs,
  groups,
  nextCohorts,
  seats = {},
  header,
  levels,
  query,
  onChange,
}: ProgramCatalogProps & { query: CatalogQuery; onChange: (next: CatalogQuery) => void }) {
  const matching = filterGroups(groups, query);
  const sections = programs
    .map((program) => ({
      program,
      // The heading line describes the program, so it reads every group of it.
      all: groups.filter((g) => g.programSlug === program.slug),
      shown: matching.filter((g) => g.programSlug === program.slug),
    }))
    .filter((s) => s.shown.length > 0);
  const closest = closestGroups(groups, query);
  // A group booked by arrangement (private lessons) takes every age and
  // level, so it is always listed. "Nothing matches" means no group with a
  // fixed class does, and none is near.
  const noClassMatches = !matching.some((g) => g.day !== null) && closest.length === 0;

  return (
    <>
      {/* Header band (audit H2): the title and lead, the three dropdowns,
          the five levels, the quiz side line. Full bleed, the Container
          inside. */}
      <div className="tb-gradient">
        <Container className="pb-1 pt-9 md:pb-2 md:pt-[60px]">
          {header}
          <Filters query={query} onChange={onChange} />
          {levels}
          <QuizSideLine source="programs-filters" className="mt-3.5" />
          {/* The results line, for screen readers: each change is announced. */}
          <p role="status" aria-live="polite" className="sr-only">
            {resultsLine(matching.length, query)}
          </p>
        </Container>
      </div>

      <Container id={GROUPS_ANCHOR} className="scroll-mt-24">
        {sections.map(({ program, all, shown }) => (
          <section key={program.slug} aria-labelledby={`catalog-${program.slug}`} className="pt-8 md:pt-11">
            <ProgramHeading program={program} groups={all} />
            {shown.some((g) => g.day !== null) && (
              <ul role="list" className={GROUP_GRID}>
                {shown
                  .filter((g) => g.day !== null)
                  .map((g) => (
                    <li key={g.id} className="flex [&>*]:w-full">
                      {/* The program's title above is an h2, so each group is an h3 under it. */}
                      <ProgramGroupCard
                        group={g}
                        program={program}
                        nextCohort={nextCohorts[g.id]}
                        seatsLeft={seats[g.id]}
                        source="programs-group"
                      />
                    </li>
                  ))}
              </ul>
            )}
            {shown
              .filter((g) => g.day === null)
              .map((g) => (
                <div key={g.id} className="mt-3.5">
                  <ArrangedGroupRow group={g} program={program} source="programs-group" />
                </div>
              ))}
          </section>
        ))}

        <ClosestFit groups={closest} programs={programs} nextCohorts={nextCohorts} seats={seats} query={query} />

        {noClassMatches && (
          // The empty state says what is true and what happens next (voice.md):
          // the quiz, where our coaches place the player. A quiz-taker is not
          // asked again (owner, 2026-10-12).
          <div className="mt-7 rounded-2xl border border-dashed border-white/25 p-5 text-[15px] text-white/75">
            <p>
              No group matches that age and level.{" "}
              <QuizSwap
                guest={
                  <>
                    <TrackedLink href="/intake" track="quiz" source="programs-empty" className={INLINE_LIME_LINK}>
                      {QUIZ_CTA_LABEL}
                    </TrackedLink>{" "}
                    and our coaches place you.
                  </>
                }
                taken={<>Your quiz answers are in, and our coaches place you from them.</>}
              />
            </p>
            <button
              type="button"
              onClick={() => onChange(clearFilters(query))}
              className={`mt-1 inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline ${FOCUS_RING}`}
            >
              Clear filters
            </button>
          </div>
        )}
      </Container>
    </>
  );
}

/** Reads the filter from the URL and writes it back with the native history API. */
function ProgramCatalogLive(props: ProgramCatalogProps) {
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const [query, setQuery] = useState<CatalogQuery>(() => parseCatalogQuery(searchParams));
  // Back and forward change the URL under us; the router reports it through
  // useSearchParams, and the selects follow. Adjusted during render (React's
  // pattern for state derived from a changed prop), never in an effect.
  const [seenUrlKey, setSeenUrlKey] = useState(urlKey);
  if (urlKey !== seenUrlKey) {
    setSeenUrlKey(urlKey);
    setQuery(parseCatalogQuery(new URLSearchParams(urlKey)));
  }

  function update(next: CatalogQuery) {
    setQuery(next);
    const qs = catalogQueryString(next);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", url);
  }

  return <ProgramCatalogView {...props} query={query} onChange={update} />;
}

export function ProgramCatalog(props: ProgramCatalogProps) {
  return (
    <Suspense fallback={<ProgramCatalogView {...props} query={initialCatalogQuery()} onChange={() => {}} />}>
      <ProgramCatalogLive {...props} />
    </Suspense>
  );
}
