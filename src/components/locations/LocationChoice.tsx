"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { TrainingLocation } from "@/types/location";
import { catalogQueryString, initialCatalogQuery, parseCatalogQuery } from "@/lib/programFilters";
import { Heading } from "@/components/ui/Heading";
import { FOCUS_RING } from "@/components/ui/focus";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { MapLink, PinIcon } from "./LocationLine";

// "Where do you want to train?" (owner, 2026-10-12: "People need to choose
// location first"). The first section of /programs, above How joining works
// and the age and level filters. One card per location, as native radios so
// the choice reads and moves like any radio group; while there is one
// location it is preselected, and the line under the heading says why. The
// choice lives in the URL (?location=), the same query the catalog reads, so
// the two never disagree; the server prerenders the preselected card as the
// Suspense fallback.

/** One location and what runs there, precomputed on the server. */
export type LocationOption = {
  location: TrainingLocation;
  /** "Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, and Private Lessons by arrangement." */
  summary: string;
};

export type LocationChoiceProps = { options: LocationOption[] };

/** A native radio drawn as a ring: lime with a navy centre when chosen. */
const RADIO =
  "mt-1 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-white/35 bg-[#061427] " +
  `motion-safe:transition-[border-width,border-color] motion-safe:duration-150 checked:border-[6px] checked:border-[#B4E655] ${FOCUS_RING}`;

/** The card: the hover and chosen states follow the radio inside it. */
const CARD =
  "flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] " +
  "motion-safe:transition-colors motion-safe:duration-150 hover:border-white/25 " +
  "has-[:checked]:border-[#B4E655]/50 has-[:checked]:bg-[#B4E655]/[0.06]";

/** The section as pure markup for a chosen location; the live wrapper owns the URL. */
export function LocationChoiceView({
  options,
  selectedId,
  onSelect,
}: LocationChoiceProps & { selectedId: string | null; onSelect: (id: string) => void }) {
  const single = options.length === 1;
  return (
    <section aria-labelledby="where-to-train">
      <Heading id="where-to-train">Where do you want to train?</Heading>
      <p className="mt-2 max-w-2xl text-pretty text-sm text-white/70 md:text-base">
        {single
          ? "Every group below trains at the location you choose. Right now we train at one club, so it's already selected."
          : "Every group below trains at the location you choose."}
      </p>

      <fieldset className="mt-6">
        <legend className="sr-only">Location</legend>
        {/* Several locations sit in a grid; the one location today is a
            single wide card, the map link on its right from md. */}
        <ul role="list" className={single ? "grid" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
          {options.map(({ location, summary }) => {
            const inputId = `location-${location.id}`;
            return (
              <li key={location.id} className={`${CARD} ${single ? "md:flex-row md:items-stretch" : ""}`.trim()}>
                <label
                  htmlFor={inputId}
                  className={`flex flex-1 cursor-pointer items-start gap-4 p-5 md:p-6 ${single ? "md:items-center" : ""}`.trim()}
                >
                  <input
                    id={inputId}
                    type="radio"
                    name="location"
                    value={location.id}
                    checked={selectedId === location.id}
                    onChange={() => onSelect(location.id)}
                    className={RADIO}
                  />
                  <span
                    className={`min-w-0 ${single ? "md:grid md:flex-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-8" : ""}`.trim()}
                  >
                    <span className="block">
                      <span className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-white">
                        <PinIcon className="h-4 w-4 shrink-0 text-[#B4E655]" />
                        {location.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-white/70">{location.area}</span>
                    </span>
                    <span className={`mt-3 block text-sm leading-relaxed text-white/75 ${single ? "md:mt-0" : ""}`.trim()}>
                      {summary}
                    </span>
                  </span>
                </label>
                {/* Outside the label, so a tap on the link never changes the choice. */}
                <p
                  className={`border-t border-white/10 px-5 md:px-6 ${single ? "md:flex md:items-center md:border-l md:border-t-0" : ""}`.trim()}
                >
                  <MapLink location={location} className={TEXT_LINK_LIME} />
                </p>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </section>
  );
}

/** Reads the chosen location from the URL and writes it back with the native history API. */
function LocationChoiceLive(props: LocationChoiceProps) {
  const searchParams = useSearchParams();
  const selected = parseCatalogQuery(searchParams).location;

  function select(id: string) {
    const current = parseCatalogQuery(new URLSearchParams(window.location.search));
    const location = props.options.find((o) => o.location.id === id)?.location ?? null;
    const qs = catalogQueryString({ ...current, location });
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  return <LocationChoiceView {...props} selectedId={selected?.id ?? null} onSelect={select} />;
}

export function LocationChoice(props: LocationChoiceProps) {
  return (
    <Suspense
      fallback={
        <LocationChoiceView {...props} selectedId={initialCatalogQuery().location?.id ?? null} onSelect={() => {}} />
      }
    >
      <LocationChoiceLive {...props} />
    </Suspense>
  );
}
