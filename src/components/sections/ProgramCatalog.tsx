"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useId, useState } from "react";
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
  isEmptyQuery,
  parseCatalogQuery,
  resultsLine,
  tierQueryFor,
  type CatalogQuery,
} from "@/lib/programFilters";
import { programEyebrow } from "@/lib/programCatalog";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { RIGHT_GROUP_PROMISE } from "@/content/programs";
import { buttonClass } from "@/components/ui/Button";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { FOCUS_RING } from "@/components/ui/focus";
import { Heading } from "@/components/ui/Heading";
import { EYEBROW_CLASS } from "./ProgramCard";
import { ProgramGroupCard } from "./ProgramGroupCard";

// The /programs catalog (owner, 2026-10-12): every group as its own card,
// under its program, with an age filter and a level filter carried in the
// URL so a filtered list can be shared and the quiz result can link to one.
// The level filter matches a group's one level tag exactly (owner,
// 2026-10-13); when no tagged group matches, the nearest-level groups for
// that age follow under "Closest fit" with the week-one promise, never a
// dead end.
// The location is chosen first, above How joining works (LocationChoice,
// owner 2026-10-12); both read the same URL, so the catalog shows the groups
// at the chosen location, and clearing the filters keeps it.
// The page is static (ISR); the filter is read and written in the browser
// with the native history API, so no request is made when a select changes.
// The server prerenders the unfiltered list as the Suspense fallback, so a
// crawler and a reader with no script see every group.

/** The program data the catalog needs, serialisable for the client. */
export type CatalogProgram = Pick<Program, "slug" | "title" | "type" | "description" | "photo" | "ageBands" | "timetable" | "schedule">;

export type ProgramCatalogProps = {
  programs: CatalogProgram[];
  groups: ProgramGroup[];
  /** The earliest public cohort per group id, already fetched by the page. */
  nextCohorts: Record<string, Cohort>;
};

const SELECT_CLASS =
  "min-h-[44px] w-full appearance-none rounded-full border border-white/35 bg-[#061427] py-2 pl-4 pr-10 text-base text-white " +
  `hover:border-white/50 md:text-sm ${FOCUS_RING}`;
const CHEVRON =
  "pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60";

function Chevron() {
  return (
    <svg aria-hidden="true" className={CHEVRON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
    </svg>
  );
}

function Filters({
  query,
  onChange,
}: {
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
}) {
  const ageId = useId();
  const levelId = useId();
  const active = !isEmptyQuery(query);
  return (
    <fieldset className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <legend className="sr-only">Filter the groups</legend>
      <div>
        <label htmlFor={ageId} className="mb-1.5 block text-sm text-white/70">
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
      <div>
        <label htmlFor={levelId} className="mb-1.5 block text-sm text-white/70">
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
                {t.name} · {t.band}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(clearFilters(query))}
        disabled={!active}
        className={buttonClass("secondary", "compact")}
      >
        Clear filters
      </button>
    </fieldset>
  );
}

function ProgramHeader({ program }: { program: CatalogProgram }) {
  const headingId = `catalog-${program.slug}`;
  return (
    <div className="flex items-start gap-4">
      {program.photo && (
        <div className="hidden w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#061427] sm:block">
          <div className="aspect-[16/10]">
            <Image
              src={program.photo.src}
              alt={program.photo.alt}
              width={program.photo.width}
              height={program.photo.height}
              sizes="96px"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <p className={EYEBROW_CLASS}>{programEyebrow(program)}</p>
        <h3 id={headingId} className="mt-1 text-lg font-semibold tracking-tight text-white">
          <Link
            href={`/programs/${program.slug}`}
            className={`rounded underline-offset-4 hover:underline ${FOCUS_RING}`}
          >
            {program.title} <span aria-hidden="true">→</span>
          </Link>
        </h3>
        <p className="mt-1 text-sm text-white/70">{program.description}</p>
      </div>
    </div>
  );
}

/**
 * "Closest fit" (owner, 2026-10-13): the nearest-level groups of every
 * program that has none at the chosen level (closestGroups), with one honest
 * line about week-one placement. The line names the chosen level and age
 * and nothing more, because another program may have matched exactly above
 * (a teen at Intermediate sees the adult group, then the youth program's
 * nearest). The cards carry the program's title in their eyebrow, since
 * they come from more than one program.
 */
function ClosestFit({
  groups,
  programs,
  nextCohorts,
  query,
}: {
  groups: ProgramGroup[];
  programs: CatalogProgram[];
  nextCohorts: Record<string, Cohort>;
  query: CatalogQuery;
}) {
  if (groups.length === 0 || !query.tier) return null;
  const scope = query.age ? ` for ${query.age.phrase}` : "";
  return (
    <section aria-labelledby="closest-fit" className="mt-10 border-t border-white/10 pt-8">
      <h3 id="closest-fit" className="text-lg font-semibold tracking-tight text-white">
        Closest fit
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
        The nearest levels to {query.tier.name}{scope}. Your coach confirms your level on court in
        week one. {RIGHT_GROUP_PROMISE}
      </p>
      <ul role="list" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const program = programs.find((p) => p.slug === g.programSlug);
          if (!program) return null;
          return (
            <li key={g.id} className="flex [&>*]:w-full">
              <ProgramGroupCard
                group={g}
                program={program}
                nextCohort={nextCohorts[g.id]}
                showProgram
                source="programs-closest"
                headingLevel={4}
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
  query,
  onChange,
}: ProgramCatalogProps & { query: CatalogQuery; onChange: (next: CatalogQuery) => void }) {
  const matching = filterGroups(groups, query);
  const sections = programs
    .map((program) => ({ program, groups: matching.filter((g) => g.programSlug === program.slug) }))
    .filter((s) => s.groups.length > 0);
  const closest = closestGroups(groups, query);

  return (
    <section aria-labelledby="catalog-heading">
      <Heading id="catalog-heading">Every group</Heading>
      <p className="mt-2 max-w-2xl text-sm text-white/70">
        Each group is built for an age range and one level. Filter by the player&apos;s age
        and level, then take the 2-minute quiz and our coaches place them.
      </p>

      <Filters query={query} onChange={onChange} />

      <p role="status" aria-live="polite" className="mt-4 text-sm font-semibold text-white/85">
        {resultsLine(matching.length, query)}
      </p>

      {sections.length > 0 || closest.length > 0 ? (
        <div className="mt-8 space-y-12">
          {sections.map(({ program, groups: list }) => (
            <section key={program.slug} aria-labelledby={`catalog-${program.slug}`}>
              <ProgramHeader program={program} />
              <ul role="list" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((g) => (
                  <li key={g.id} className="flex [&>*]:w-full">
                    {/* The program's title above is an h3, so each group is an h4 under it. */}
                    <ProgramGroupCard
                      group={g}
                      program={program}
                      nextCohort={nextCohorts[g.id]}
                      showProgram={false}
                      source="programs-group"
                      headingLevel={4}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <ClosestFit groups={closest} programs={programs} nextCohorts={nextCohorts} query={query} />
        </div>
      ) : (
        // The empty state says what is true and what happens next (voice.md).
        <div className="mt-8 rounded-2xl border border-dashed border-white/20 p-6">
          <p className="text-base font-semibold text-white">No group fits those filters yet.</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            Our coaches still place every player by level and schedule. Take the 2-minute quiz and
            tell us about the player, or widen the filters.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {/* A quiz-taker's button reads their next step instead (owner, 2026-10-12). */}
            <TrackedLink href="/intake" track="quiz" source="programs-empty" className={buttonClass("primary")}>
              {QUIZ_CTA_LABEL}
            </TrackedLink>
            <button
              type="button"
              onClick={() => onChange(clearFilters(query))}
              className={buttonClass("secondary", "compact")}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </section>
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
